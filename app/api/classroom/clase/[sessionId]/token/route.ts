import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassroomAccess } from "@/lib/classroom/access";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { getLiveKitConfig, LiveKitNotConfiguredError } from "@/lib/livekit/config";
import { decideRoomAccess, type RoomSession } from "@/lib/livekit/access";
import {
  decideGuestAccess,
  guestCookieName,
  type GuestStatus,
} from "@/lib/livekit/guest-access";
import { parseSessionRef } from "@/lib/livekit/meeting-code";
import { createAccessToken } from "@/lib/livekit/token";
import { cookies } from "next/headers";

export const runtime = "nodejs";

/**
 * Emite el token con que un participante entra a la sala de SU clase (ADR-0031).
 *
 * El servidor de LiveKit no conoce cohortes ni matrículas: autoriza únicamente
 * por lo que diga este token firmado. Toda la decisión de acceso ocurre acá,
 * contra nuestra base, y después se firma. De ahí tres reglas:
 *
 * 1. **La sala se deriva del id de la sesión**, nunca se acepta del cliente. Si
 *    se aceptara, pedir la sala de otra cohorte sería cambiar una cadena.
 * 2. **La cohorte también se deriva de la sesión**, y la matrícula se verifica
 *    contra ESA cohorte. Así no hay forma de que el cliente diga en qué cohorte
 *    cree estar.
 * 3. **El token vence con la clase** (más gracia de reconexión): una credencial
 *    que sobreviva a la clase sigue abriendo una puerta que ya se cerró.
 *
 * La sesión se lee con el cliente admin y la autorización se resuelve con
 * `getClassroomAccess`, que es el helper que ya usa la pantalla de la clase:
 * una sola definición de quién entra, en vez de dos que puedan divergir.
 */

/**
 * Un token por participante por clase alcanza; el resto son reintentos y
 * reconexiones. 10/min deja margen para un wifi inestable y corta un bucle que
 * se ponga a pedir tokens.
 */
const tokenLimiter = createRateLimiter({ limit: 10, windowSeconds: 60 });

/**
 * Mensajes por motivo de rechazo. La persona tiene que entender qué le pasa y,
 * cuando corresponde, qué puede hacer al respecto.
 *
 * Los tres estados de la sala de espera (0091) van con `puedeSolicitar` para que
 * la pantalla sepa si ofrecer el botón de pedir entrar o solo informar.
 */
const DENIAL: Record<
  string,
  { status: number; error: string; puedeSolicitar?: boolean; esperando?: boolean }
> = {
  not_live: { status: 409, error: "Esta clase no es en vivo." },
  wrong_cohort: { status: 404, error: "No encontramos esta clase." },
  outside_window: {
    status: 409,
    error:
      "La sala se abre 30 minutos antes de la clase y se cierra 2 horas después de que termina.",
  },
  needs_approval: {
    status: 403,
    error: "No estás matriculado en esta clase, pero puedes pedirle al docente que te deje entrar.",
    puedeSolicitar: true,
  },
  awaiting_approval: {
    status: 403,
    error: "Ya pediste entrar. Estamos esperando que el docente te acepte.",
    esperando: true,
  },
  denied: {
    status: 403,
    error: "El docente no aceptó tu solicitud para entrar a esta clase.",
  },
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sin sesión iniciada NO se rechaza de entrada: puede ser un invitado de una
  // sala abierta (0099). La bifurcación ocurre más abajo, cuando ya se sabe si
  // ESTA sala admite invitados; antes de eso no hay nada que decidir.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "sin-ip";
  const limit = tokenLimiter.check(user?.id ?? `ip:${ip}`);
  if (!limit.ok) return rateLimitResponse(limit);

  let config;
  try {
    config = getLiveKitConfig();
  } catch (e) {
    if (e instanceof LiveKitNotConfiguredError) {
      console.error("[livekit/token] sin configurar:", e.missing.join(", "));
      return NextResponse.json(
        { error: "Las clases en vivo no están configuradas.", missing: e.missing },
        { status: 503 },
      );
    }
    throw e;
  }

  // La URL puede traer el código legible (`abc-defg-hij`) o el UUID: los correos
  // de recordatorio que ya circulan llevan el UUID y no se pueden romper.
  const ref = parseSessionRef(sessionId);
  if (ref.kind === "invalid") {
    return NextResponse.json({ error: "No encontramos esta clase." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("class_sessions")
    .select("id, cohort_id, starts_at, ends_at, modality, guest_access")
    .eq(ref.kind === "code" ? "code" : "id", ref.value)
    .maybeSingle();

  if (error) {
    console.error("[livekit/token] error leyendo la sesión", sessionId, error);
    return NextResponse.json({ error: "Error al leer la clase" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "No encontramos esta clase." }, { status: 404 });
  }

  const session = data as RoomSession;
  const guestAccess = Boolean((data as { guest_access?: boolean }).guest_access);

  if (!user) {
    return tokenDeInvitado({ session, guestAccess, config });
  }

  // La cohorte sale de la sesión, no del cliente: la matrícula se verifica
  // contra la cohorte REAL de la clase.
  const access = await getClassroomAccess(user.id, session.cohort_id);

  // Sala de espera (0091): solo importa para quien NO tiene matrícula ni rol.
  // Se consulta con el cliente admin porque la RLS de la tabla solo deja ver la
  // fila propia, y acá se está resolviendo el acceso de esa misma persona.
  type EstadoSolicitud = "pending" | "approved" | "denied";
  let solicitud: EstadoSolicitud | null = null;
  if (!access?.enrollment && !access?.isStaff) {
    const { data: fila } = await admin
      .from("room_join_requests")
      .select("status")
      .eq("session_id", session.id)
      .eq("user_id", user.id)
      .maybeSingle();
    solicitud = (fila?.status as EstadoSolicitud | undefined) ?? null;
  }

  const decision = decideRoomAccess({
    session,
    cohortId: session.cohort_id,
    hasActiveEnrollment: Boolean(access?.enrollment),
    isStaff: Boolean(access?.isStaff),
    solicitud,
    now: new Date(),
  });

  if (!decision.allowed) {
    const { status, error: message, puedeSolicitar, esperando } = DENIAL[decision.reason];
    return NextResponse.json(
      { error: message, reason: decision.reason, puedeSolicitar, esperando },
      { status },
    );
  }

  // El nombre visible sale del perfil, no del cliente: si lo mandara el
  // navegador, cualquiera podría aparecer en la sala con el nombre de otro.
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const token = createAccessToken({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    identity: user.id,
    name: profile?.full_name || profile?.email || "Participante",
    grant: decision.grant,
    issuedAt: new Date(),
    expiresAt: decision.expiresAt,
  });

  return NextResponse.json({
    token,
    url: config.url,
    room: decision.grant.room,
    role: decision.role,
    expiresAt: decision.expiresAt.toISOString(),
  });
}

/** Mensajes de rechazo del invitado. `esperando` le dice a la pantalla que siga consultando. */
const GUEST_DENIAL: Record<
  string,
  { status: number; error: string; esperando?: boolean }
> = {
  // Una sala que no admite invitados se comporta como si no existiera: distinguir
  // los dos casos convertiría esta ruta en un detector de códigos válidos.
  guests_not_allowed: { status: 404, error: "No encontramos esta clase." },
  not_live: { status: 409, error: "Esta clase no es en vivo." },
  outside_window: {
    status: 409,
    error:
      "La sala se abre 30 minutos antes de la clase y se cierra 2 horas después de que termina.",
  },
  no_request: { status: 401, error: "Escribe tu nombre para pedir entrar." },
  awaiting_approval: {
    status: 403,
    error: "Ya pediste entrar. Estamos esperando que el docente te acepte.",
    esperando: true,
  },
  denied: { status: 403, error: "El docente no aceptó tu solicitud para entrar a esta clase." },
};

/**
 * Token de un INVITADO SIN CUENTA (0099).
 *
 * Su identidad no sale de `auth`, sino de la fila de `room_guests` que nombra su
 * cookie — y esa fila se lee filtrando por `session_id`, así que la credencial de
 * una clase no sirve en otra. El nombre visible se construye en el servidor con
 * el sufijo "(invitado)": si se aceptara del cliente, cualquiera podría aparecer
 * en la sala con el nombre de la docente.
 */
async function tokenDeInvitado({
  session,
  guestAccess,
  config,
}: {
  session: RoomSession;
  guestAccess: boolean;
  config: { url: string; apiKey: string; apiSecret: string };
}) {
  const store = await cookies();
  const guestId = store.get(guestCookieName(session.id))?.value ?? null;

  let guest: { id: string; display_name: string; status: GuestStatus } | null = null;
  if (guestId) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("room_guests")
      .select("id, display_name, status")
      .eq("id", guestId)
      .eq("session_id", session.id)
      .maybeSingle();
    guest = (data as typeof guest) ?? null;
  }

  const decision = decideGuestAccess({ session, guestAccess, guest, now: new Date() });

  if (!decision.allowed) {
    const { status, error, esperando } = GUEST_DENIAL[decision.reason];
    return NextResponse.json({ error, reason: decision.reason, esperando }, { status });
  }

  const token = createAccessToken({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    identity: decision.identity,
    name: decision.name,
    grant: decision.grant,
    issuedAt: new Date(),
    expiresAt: decision.expiresAt,
  });

  return NextResponse.json({
    token,
    url: config.url,
    room: decision.grant.room,
    role: "guest",
    expiresAt: decision.expiresAt.toISOString(),
  });
}
