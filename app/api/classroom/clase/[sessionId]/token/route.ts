import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassroomAccess } from "@/lib/classroom/access";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { getLiveKitConfig, LiveKitNotConfiguredError } from "@/lib/livekit/config";
import { decideRoomAccess, type RoomSession } from "@/lib/livekit/access";
import { parseSessionRef } from "@/lib/livekit/meeting-code";
import { createAccessToken } from "@/lib/livekit/token";

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

/** Mensajes por motivo de rechazo. El alumno tiene que entender qué le pasa. */
const DENIAL: Record<string, { status: number; error: string }> = {
  not_live: { status: 409, error: "Esta clase no es en vivo." },
  wrong_cohort: { status: 404, error: "No encontramos esta clase." },
  no_access: { status: 403, error: "No estás matriculado en esta clase." },
  outside_window: {
    status: 409,
    error:
      "La sala se abre 30 minutos antes de la clase y se cierra 2 horas después de que termina.",
  },
};

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const limit = tokenLimiter.check(user.id);
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
    .select("id, cohort_id, starts_at, ends_at, modality")
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

  // La cohorte sale de la sesión, no del cliente: la matrícula se verifica
  // contra la cohorte REAL de la clase.
  const access = await getClassroomAccess(user.id, session.cohort_id);

  const decision = decideRoomAccess({
    session,
    cohortId: session.cohort_id,
    hasActiveEnrollment: Boolean(access?.enrollment),
    isStaff: Boolean(access?.isStaff),
    now: new Date(),
  });

  if (!decision.allowed) {
    const { status, error: message } = DENIAL[decision.reason];
    return NextResponse.json({ error: message }, { status });
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
