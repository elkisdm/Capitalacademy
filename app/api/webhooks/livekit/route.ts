import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLiveKitConfig, LiveKitNotConfiguredError } from "@/lib/livekit/config";
import {
  normalizeEgressInfo,
  verifyLiveKitWebhook,
  type EgressInfo,
  type LiveKitWebhookEvent,
} from "@/lib/livekit/webhook";
import { estadoDesdeEgress, type EstadoGrabacion } from "@/lib/livekit/egress-estado";
import { ingestRecording } from "@/lib/classroom/ingest-recording";

export const runtime = "nodejs";
// La ingesta a Mux se AWAITEA dentro del handler: en serverless la instancia se
// congela al responder, así que un fire-and-forget mata la promesa en vuelo y
// deja la clase sin repetición. Mismo criterio que el webhook de Mux.
export const maxDuration = 300;

/**
 * Webhooks del servidor LiveKit (ADR-0034).
 *
 * Lo llama el `livekit-server`, no un navegador. La firma es un JWT en
 * `Authorization` que incluye el hash del cuerpo, así que el cuerpo se lee CRUDO
 * antes de parsear (ver `lib/livekit/webhook.ts`).
 *
 * Todos los eventos entran por la misma URL: `room_started`,
 * `participant_joined` y compañía llegan igual y se responden 200 sin hacer
 * nada. Son ruido hoy; convertirlos en error haría que LiveKit reintentara para
 * siempre algo que nunca nos importó.
 */

const COLUMNAS = "id, session_id, status, storage_path";

type Fila = {
  id: string;
  session_id: string;
  status: EstadoGrabacion;
  storage_path: string | null;
};

/** El nombre de sala es `clase-<uuid de la sesión>` (ver roomNameForSession). */
function sessionIdDeSala(roomName: string | undefined): string | null {
  if (!roomName?.startsWith("clase-")) return null;
  return roomName.slice("clase-".length) || null;
}

/**
 * Ubica la fila del evento.
 *
 * Primero por `egress_id`, que es la llave. El respaldo por sala existe para el
 * caso en que StartEgress respondió pero no alcanzamos a guardar su id: sin él,
 * la fila quedaría viva para siempre y el archivo sin ingestar.
 */
async function ubicarFila(
  admin: ReturnType<typeof createAdminClient>,
  info: EgressInfo,
): Promise<Fila | null> {
  if (info.egressId) {
    const { data } = await admin
      .from("session_recordings")
      .select(COLUMNAS)
      .eq("egress_id", info.egressId)
      .maybeSingle();
    if (data) return data as Fila;
  }

  const sessionId = sessionIdDeSala(info.roomName);
  if (!sessionId) return null;

  const { data } = await admin
    .from("session_recordings")
    .select(COLUMNAS)
    .eq("session_id", sessionId)
    .in("status", ["starting", "active"])
    .maybeSingle();
  return (data as Fila | null) ?? null;
}

/**
 * LiveKit reporta duraciones y tamaños en enteros de 64 bits; la duración del
 * archivo viene en NANOSEGUNDOS. Convertir mal deja una clase de 2,5 h
 * registrada como 9 billones de segundos, que es peor que no registrarla.
 */
function segundosDesde(duration: number | undefined): number | null {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return null;
  return duration > 10_000_000 ? Math.round(duration / 1e9) : Math.round(duration);
}

export async function POST(req: Request) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  let config;
  try {
    config = getLiveKitConfig();
  } catch (e) {
    if (!(e instanceof LiveKitNotConfiguredError)) throw e;
    // Fail-closed: sin credenciales no hay forma de distinguir a LiveKit de
    // cualquiera que conozca la URL, y este endpoint escribe en la base y crea
    // assets en Mux.
    console.error("[webhooks/livekit] sin credenciales — rechazado", e.missing.join(", "));
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 500 });
  }

  const verificado = verifyLiveKitWebhook(
    rawBody,
    req.headers.get("authorization"),
    config.apiKey,
    config.apiSecret,
  );

  let evento: LiveKitWebhookEvent;
  if (verificado.ok) {
    evento = verificado.event;
  } else {
    // Fail-closed SIEMPRE, no solo cuando NODE_ENV === "production": llegar
    // acá implica que hay credenciales configuradas (sin ellas la ruta ya
    // rechazó arriba), y un branch deploy o un contenedor donde NODE_ENV no
    // llegue exactamente como "production" no puede convertirse en una puerta
    // sin firma a un endpoint que escribe en la base, crea assets en Mux y
    // alimenta borrados del bucket. Para ejercitar el flujo con curl en local
    // existe el opt-in explícito LIVEKIT_WEBHOOK_ALLOW_UNSIGNED=1.
    if (process.env.LIVEKIT_WEBHOOK_ALLOW_UNSIGNED !== "1") {
      console.error("[webhooks/livekit] firma rechazada:", verificado.reason);
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }
    console.warn("[webhooks/livekit] firma inválida (opt-in local):", verificado.reason);
    try {
      const crudo = JSON.parse(rawBody) as Record<string, unknown>;
      evento = {
        event: String(crudo.event ?? ""),
        egressInfo: normalizeEgressInfo(crudo.egressInfo ?? crudo.egress_info),
      };
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }
  }

  const info = evento.egressInfo;

  if (!info || !evento.event.startsWith("egress_")) {
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  const fila = await ubicarFila(admin, info);
  if (!fila) {
    // Puede ser una grabación que nunca registramos (arrancada a mano contra
    // LiveKit). No es un error del emisor: 200 y a otra cosa.
    console.warn("[webhooks/livekit] evento sin fila:", evento.event, info.egressId ?? "");
    return NextResponse.json({ received: true });
  }

  const estado = estadoDesdeEgress(info.status);

  if (evento.event === "egress_started" || evento.event === "egress_updated") {
    if (estado === "starting" || estado === "active") {
      await admin
        .from("session_recordings")
        .update({ status: estado, egress_id: info.egressId ?? null })
        .eq("id", fila.id)
        .in("status", ["starting", "active"]);
    }
    return NextResponse.json({ received: true });
  }

  if (evento.event !== "egress_ended") {
    return NextResponse.json({ received: true });
  }

  const ahora = new Date().toISOString();

  if (estado === "failed") {
    await admin
      .from("session_recordings")
      .update({
        status: "failed",
        ended_at: ahora,
        error: info.error?.slice(0, 500) || "Egress terminó sin poder grabar la clase.",
      })
      .eq("id", fila.id)
      .in("status", ["starting", "active"]);
    return NextResponse.json({ received: true });
  }

  // Solo EGRESS_COMPLETE es éxito. Un status desconocido (una versión nueva de
  // Egress, un payload malformado) NO puede caer al camino feliz: se deja la
  // fila como está, con log, y la reconciliación del cron la resuelve contra
  // ListEgress con el estado real.
  if (estado !== "uploaded") {
    console.warn("[webhooks/livekit] egress_ended con status no mapeado:", info.status ?? "");
    return NextResponse.json({ received: true });
  }

  const archivo = info.fileResults?.[0];

  // Reserva-antes-de-actuar: el `in(status)` es lo que hace que una reentrega no
  // vuelva a pasar por acá con la fila ya cerrada. Tamaño y duración solo se
  // escriben cuando el evento TRAE el archivo: una reentrega sin fileResults no
  // debe borrar con null lo que la entrega original ya dejó.
  const { data: cerrada } = await admin
    .from("session_recordings")
    .update({
      status: "uploaded",
      ended_at: ahora,
      storage_path: archivo?.filename || fila.storage_path,
      egress_id: info.egressId ?? null,
      ...(archivo
        ? {
            file_size_bytes: archivo.size ?? null,
            duration_seconds: segundosDesde(archivo.duration),
          }
        : {}),
    })
    .eq("id", fila.id)
    .in("status", ["starting", "active", "uploaded"])
    .select("id")
    .maybeSingle();

  if (!cerrada) {
    // Ya estaba cerrada (reentrega): no se ingesta de nuevo.
    return NextResponse.json({ received: true });
  }

  const resultado = await ingestRecording(admin, fila.id);
  if (!resultado.ok) {
    console.warn("[webhooks/livekit] la ingesta no siguió:", resultado.motivo);
  }

  return NextResponse.json({ received: true });
}
