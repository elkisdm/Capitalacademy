import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { iniciarGrabacionDeSesion } from "@/lib/classroom/iniciar-grabacion";
import { getClassroomAccess } from "@/lib/classroom/access";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import {
  getLiveKitConfig,
  LiveKitNotConfiguredError,
  type LiveKitConfig,
} from "@/lib/livekit/config";
import { decideRoomAccess, roomNameForSession, type RoomSession } from "@/lib/livekit/access";
import { parseSessionRef } from "@/lib/livekit/meeting-code";
import {
  EgressNotConfiguredError,
  EgressRequestError,
  getEgressStorageConfig,
  stopEgress,
  type EgressStorageConfig,
} from "@/lib/livekit/egress";
import {
  estaGrabando,
  type EstadoGrabacion,
} from "@/lib/livekit/egress-estado";

export const runtime = "nodejs";

/**
 * Grabación nativa de la clase en vivo (ADR-0034).
 *
 * El navegador del docente llama al POST solo, al conectarse a la sala: si la
 * grabación dependiera de que alguien pulse un botón, habríamos movido el cuello
 * de botella humano, no eliminado. Por eso el POST es IDEMPOTENTE — que ya haya
 * una grabación en curso no es un error, es el resultado que quien llama quería.
 *
 * La autorización es la misma de `moderar/route.ts`: solo quien dicta esa clase.
 * Un alumno con token válido de la sala, un invitado aprobado en la sala de
 * espera (0091) y un docente de OTRA cohorte reciben 403. La cohorte nunca viene
 * del cliente: sale de la sesión.
 */

const grabacionLimiter = createRateLimiter({ limit: 20, windowSeconds: 60 });

type SessionRow = RoomSession & { lesson_id: string | null };

type RecordingRow = {
  id: string;
  status: EstadoGrabacion;
  egress_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  error: string | null;
};

const COLUMNAS_FILA = "id, status, egress_id, started_at, ended_at, duration_seconds, error";

type Contexto = {
  admin: ReturnType<typeof createAdminClient>;
  session: SessionRow;
  room: string;
  userId: string;
};

/**
 * Autentica, resuelve la clase y exige que quien llama sea quien la dicta.
 * Devuelve una `Response` cuando hay que cortar, o el contexto cuando pasa.
 */
async function autorizar(sessionRef: string): Promise<Response | Contexto> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const limit = grabacionLimiter.check(user.id);
  if (!limit.ok) return rateLimitResponse(limit);

  // `parseSessionRef` devuelve `{ kind: "invalid" }`, que es truthy: hay que
  // mirar el `kind`, no la verdad del objeto.
  const ref = parseSessionRef(sessionRef);
  if (ref.kind === "invalid") {
    return NextResponse.json({ error: "No encontramos esta clase." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("class_sessions")
    .select("id, cohort_id, starts_at, ends_at, modality, lesson_id")
    .eq(ref.kind === "code" ? "code" : "id", ref.value)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "No encontramos esta clase." }, { status: 404 });
  }
  const session = data as SessionRow;

  const access = await getClassroomAccess(user.id, session.cohort_id);
  const decision = decideRoomAccess({
    session,
    cohortId: session.cohort_id,
    hasActiveEnrollment: Boolean(access?.enrollment),
    isStaff: Boolean(access?.isStaff),
    now: new Date(),
  });

  if (!decision.allowed || decision.role !== "teacher") {
    return NextResponse.json({ error: "No puedes grabar esta clase." }, { status: 403 });
  }

  return { admin, session, room: roomNameForSession(session.id), userId: user.id };
}

/** Última fila de esa clase, esté viva o no. */
async function ultimaFila(ctx: Contexto): Promise<RecordingRow | null> {
  const { data } = await ctx.admin
    .from("session_recordings")
    .select(COLUMNAS_FILA)
    .eq("session_id", ctx.session.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as RecordingRow | null) ?? null;
}

/** Fila viva (`starting`/`active`) de esa clase, si existe. */
async function filaViva(ctx: Contexto): Promise<RecordingRow | null> {
  const { data } = await ctx.admin
    .from("session_recordings")
    .select(COLUMNAS_FILA)
    .eq("session_id", ctx.session.id)
    .in("status", ["starting", "active"])
    .maybeSingle();
  return (data as RecordingRow | null) ?? null;
}

function configuracion():
  | { ok: true; config: LiveKitConfig; storage: EgressStorageConfig }
  | { ok: false; missing: string[] } {
  const missing: string[] = [];
  let config: LiveKitConfig | null = null;
  let storage: EgressStorageConfig | null = null;

  try {
    config = getLiveKitConfig();
  } catch (e) {
    if (!(e instanceof LiveKitNotConfiguredError)) throw e;
    missing.push(...e.missing);
  }
  try {
    storage = getEgressStorageConfig();
  } catch (e) {
    if (!(e instanceof EgressNotConfiguredError)) throw e;
    missing.push(...e.missing);
  }

  // Se juntan las dos listas a propósito: quien despliega quiere ver de una vez
  // todo lo que falta, no descubrir la segunda variable después de poner la
  // primera.
  if (!config || !storage) return { ok: false, missing };
  return { ok: true, config, storage };
}

function estadoResponse(fila: RecordingRow | null, lessonId: string | null, extra = {}) {
  return NextResponse.json({
    grabando: estaGrabando(fila?.status),
    estado: fila?.status ?? null,
    iniciadaEn: fila?.started_at ?? null,
    duracionSegundos: fila?.duration_seconds ?? null,
    error: fila?.error ?? null,
    lessonId,
    ...extra,
  });
}

export async function GET(_req: Request, ctxParams: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctxParams.params;
  const ctx = await autorizar(sessionId);
  if (ctx instanceof Response) return ctx;

  return estadoResponse(await ultimaFila(ctx), ctx.session.lesson_id);
}

export async function POST(_req: Request, ctxParams: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctxParams.params;
  const ctx = await autorizar(sessionId);
  if (ctx instanceof Response) return ctx;

  // El arranque vive en `lib/classroom/iniciar-grabacion`: lo comparte con el
  // webhook, que enciende la grabación cuando entra el primer participante. La
  // coreografía de la reserva es delicada y no puede existir dos veces.
  const res = await iniciarGrabacionDeSesion(ctx.admin, {
    sessionId: ctx.session.id,
    room: ctx.room,
    startedBy: ctx.userId,
  });

  if (res.ok) {
    return estadoResponse(res.fila as RecordingRow, ctx.session.lesson_id, {
      egressId: res.egressId,
      ...(res.yaEstaba ? { yaEstaba: true as const } : {}),
    });
  }

  if (res.motivo === "deshabilitado") {
    return NextResponse.json({ grabando: false, estado: null, deshabilitado: true });
  }
  if (res.motivo === "sin_configuracion") {
    return NextResponse.json(
      { error: "La grabación no está configurada.", missing: res.missing },
      { status: 503 },
    );
  }
  if (res.motivo === "sala_vacia") {
    return NextResponse.json({ error: "Entra a la sala antes de grabar." }, { status: 409 });
  }
  if (res.motivo === "cancelada") {
    return estadoResponse((res.fila as RecordingRow | null), ctx.session.lesson_id);
  }
  // `ya_grabada` solo lo produce el arranque automático; por el botón no llega.
  if (res.motivo === "ya_grabada") {
    return estadoResponse(await ultimaFila(ctx), ctx.session.lesson_id);
  }
  return NextResponse.json({ error: res.detalle }, { status: 502 });
}

export async function DELETE(_req: Request, ctxParams: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctxParams.params;
  const ctx = await autorizar(sessionId);
  if (ctx instanceof Response) return ctx;

  const viva = await filaViva(ctx);
  // Detener algo que no está grabando es el resultado que quien llama quería.
  // Se responde con el estado REAL de la última fila: el doble-clic en
  // "Detener" (LiveKit tarda unos segundos en propagar isRecording=false) no
  // debe borrarle al panel el estado que ya tenía.
  if (!viva) {
    return estadoResponse(await ultimaFila(ctx), ctx.session.lesson_id, { yaEstaba: true });
  }

  const ahora = new Date().toISOString();

  // Sin `egress_id` no hay trabajo que detener: la fila quedó reservada y
  // StartEgress nunca devolvió. Se cierra como fallida para liberar la sala.
  if (!viva.egress_id) {
    await ctx.admin
      .from("session_recordings")
      .update({
        status: "failed",
        error: "Se detuvo antes de que la grabación llegara a empezar.",
        ended_at: ahora,
      })
      .eq("id", viva.id);
    return NextResponse.json({ grabando: false, estado: "failed" });
  }

  const conf = configuracion();
  if (!conf.ok) {
    return NextResponse.json(
      { error: "La grabación no está configurada.", missing: conf.missing },
      { status: 503 },
    );
  }

  try {
    await stopEgress({ config: conf.config, room: ctx.room, egressId: viva.egress_id });
  } catch (e) {
    // "Ese trabajo no existe" significa que ya terminó solo: es exactamente lo
    // que se estaba pidiendo. Cualquier otro fallo se deja vivo para que el cron
    // lo corte, en vez de mentir diciendo que se detuvo.
    if (!(e instanceof EgressRequestError && e.salaInexistente)) {
      console.error("[clase/grabacion] StopEgress falló", e);
      return NextResponse.json({ error: "No se pudo detener la grabación." }, { status: 502 });
    }
  }

  // El archivo lo sube Egress al terminar el trabajo: `egress_ended` completa
  // `storage_path`, tamaño y duración, y dispara la ingesta.
  await ctx.admin
    .from("session_recordings")
    .update({ status: "uploaded", ended_at: ahora })
    .eq("id", viva.id);

  return NextResponse.json({ grabando: false, estado: "uploaded" });
}
