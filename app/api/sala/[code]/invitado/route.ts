import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { parseSessionRef } from "@/lib/livekit/meeting-code";
import { ROOM_CLOSES_AFTER_MIN, type RoomSession } from "@/lib/livekit/access";
import {
  decideGuestAccess,
  guestCookieName,
  sanitizeGuestName,
  type GuestStatus,
} from "@/lib/livekit/guest-access";

export const runtime = "nodejs";

/**
 * Sala de espera de INVITADOS SIN CUENTA (ADR-0035, migración 0099).
 *
 * Es la única ruta del producto que atiende a alguien no autenticado y le crea
 * una fila. De ahí las precauciones:
 *
 * 1. **Solo responde si la sala tiene `guest_access` encendido.** Si no, contesta
 *    404 igual que si la clase no existiera: una sala cerrada no admite ni que le
 *    pregunten, y distinguir "no existe" de "existe pero no admite invitados"
 *    convertiría esto en un detector de códigos válidos.
 * 2. **El límite se cuenta por IP**, no por usuario: acá no hay usuario.
 * 3. **La credencial es el `id` de la fila**, en cookie `httpOnly`. Nunca viaja
 *    en el cuerpo ni queda al alcance del JavaScript de la página.
 *
 *   POST → pedir entrar (nombre). Crea la fila `pending` y deja la cookie.
 *   GET  → su propio estado, para que la pantalla sepa cuándo lo aprobaron.
 */

/**
 * 5 por minuto y por IP. Pedir entrar es un acto humano y ocurre una vez; esto
 * deja margen para el que se equivoca al escribir su nombre y corta a quien
 * quiera llenarle el panel al docente.
 */
const invitadoLimiter = createRateLimiter({ limit: 5, windowSeconds: 60 });

const schema = z.object({ nombre: z.string() });

type SesionInvitados = RoomSession & { guest_access: boolean };

async function cargarSesion(code: string): Promise<SesionInvitados | null> {
  const ref = parseSessionRef(code);
  if (ref.kind === "invalid") return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("class_sessions")
    .select("id, cohort_id, starts_at, ends_at, modality, guest_access")
    .eq(ref.kind === "code" ? "code" : "id", ref.value)
    .maybeSingle();

  return (data as SesionInvitados | null) ?? null;
}

/** La fila que nombra su cookie, SOLO si es de esta sesión. */
async function filaDelInvitado(sessionId: string) {
  const store = await cookies();
  const guestId = store.get(guestCookieName(sessionId))?.value;
  if (!guestId) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("room_guests")
    .select("id, display_name, status")
    .eq("id", guestId)
    // El filtro que hace que la cookie de la clase A no sirva en la clase B.
    .eq("session_id", sessionId)
    .maybeSingle();

  return (data as { id: string; display_name: string; status: GuestStatus } | null) ?? null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;

  const session = await cargarSesion(code);
  if (!session || !session.guest_access) {
    return NextResponse.json({ error: "No encontramos esta clase." }, { status: 404 });
  }

  const guest = await filaDelInvitado(session.id);
  return NextResponse.json({
    estado: guest?.status ?? "none",
    nombre: guest?.display_name ?? null,
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sin-ip";
  const limit = invitadoLimiter.check(ip);
  if (!limit.ok) return rateLimitResponse(limit);

  const session = await cargarSesion(code);
  if (!session || !session.guest_access) {
    return NextResponse.json({ error: "No encontramos esta clase." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  const nombre = parsed.success ? sanitizeGuestName(parsed.data.nombre) : null;
  if (!nombre) {
    return NextResponse.json(
      { error: "Escribe tu nombre (entre 2 y 40 caracteres)." },
      { status: 400 },
    );
  }

  // La modalidad, el flag y la ventana se evalúan con la MISMA función que decide
  // el acceso final, para que la puerta de entrada y la de salida no puedan
  // divergir. `guest: null` porque acá todavía no hay solicitud.
  const previo = decideGuestAccess({
    session,
    guestAccess: session.guest_access,
    guest: null,
    now: new Date(),
  });
  if (!previo.allowed && previo.reason === "not_live") {
    return NextResponse.json({ error: "Esta clase no es en vivo." }, { status: 409 });
  }
  if (!previo.allowed && previo.reason === "outside_window") {
    return NextResponse.json(
      {
        error:
          "La sala se abre 30 minutos antes de la clase y se cierra 2 horas después de que termina.",
      },
      { status: 409 },
    );
  }

  const admin = createAdminClient();

  // Si ya pidió antes, se REUTILIZA su fila. Dos motivos: no llenarle la lista al
  // docente con la misma persona, y —sobre todo— que a quien fue rechazado no le
  // sirva volver a enviar el formulario con otro nombre.
  const existente = await filaDelInvitado(session.id);
  if (existente) {
    return NextResponse.json({ estado: existente.status, nombre: existente.display_name });
  }

  const { data, error } = await admin
    .from("room_guests")
    .insert({ session_id: session.id, display_name: nombre })
    .select("id, status")
    .single();

  if (error || !data) {
    console.error("[sala/invitado] no se pudo crear la solicitud:", error?.message);
    return NextResponse.json({ error: "No pudimos registrar tu solicitud." }, { status: 500 });
  }

  const res = NextResponse.json({ estado: data.status as GuestStatus, nombre });

  // La cookie vive lo que vive la sala: una credencial que sobreviva a la clase
  // sigue abriendo una puerta que ya se cerró (mismo criterio que el token).
  const cierra = new Date(session.ends_at).getTime() + ROOM_CLOSES_AFTER_MIN * 60_000;
  const maxAge = Math.max(60, Math.floor((cierra - Date.now()) / 1000));

  res.cookies.set(guestCookieName(session.id), data.id as string, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  return res;
}
