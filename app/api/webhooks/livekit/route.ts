import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLiveKitConfig, LiveKitNotConfiguredError } from "@/lib/livekit/config";
import {
  normalizeEgressInfo,
  verifyLiveKitWebhook,
  nombreDeSala,
  type EgressInfo,
  type LiveKitWebhookEvent,
} from "@/lib/livekit/webhook";
import { estadoDesdeEgress, type EstadoGrabacion } from "@/lib/livekit/egress-estado";
import { ingestRecording } from "@/lib/classroom/ingest-recording";
import { iniciarGrabacionDeSesion } from "@/lib/classroom/iniciar-grabacion";
import { isWithinRoomWindow, isLiveModality, roomNameForSession } from "@/lib/livekit/access";
import { isEgressEnabled } from "@/lib/livekit/egress";

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
 * Todos los eventos entran por la misma URL. `participant_joined` enciende la
 * grabación (ver abajo); el resto se responde 200 sin hacer nada — convertirlos
 * en error haría que LiveKit reintentara para siempre algo que no nos importa.
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
        roomName: nombreDeSala(crudo.room),
      };
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }
  }

  // ── Arranque automático ────────────────────────────────────────────────
  // La grabación dejó de depender de que entre un DOCENTE. Antes la disparaba
  // el navegador de quien tuviera rol `teacher`; si esa persona no entraba
  // —por ejemplo porque el docente de la clase no tiene cuenta— la clase no se
  // grababa, sin error y sin aviso. Ahora la enciende el servidor cuando entra
  // el PRIMER participante, sea quien sea.
  // Solo `participant_joined`. `room_started` llega ANTES de que el primero
  // termine de conectarse: la reserva se crearía, StartEgress fallaría con
  // "sala inexistente" y el `participant_joined` que viene detrás encontraría
  // esa fila y no haría nada. Resultado: clase sin grabar y nada que reintente.
  if (evento.event === "participant_joined") {
    // El try/catch no es decorativo: `createAdminClient()` LANZA si falta la
    // service-role key, y sin esto cada ingreso a una sala se volvería un 500
    // que LiveKit reintenta en bucle — justo lo que el silencio quiere evitar.
    try {
      await intentarArranqueAutomatico(evento.roomName);
    } catch (e) {
      console.error("[webhooks/livekit] arranque automático falló", e);
    }
    return NextResponse.json({ received: true });
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

/**
 * Enciende la grabación de la clase a la que pertenece la sala.
 *
 * Silencioso a propósito: es un webhook, y devolver error haría que LiveKit lo
 * reintentara en bucle por algo que no se arregla reintentando (una clase fuera
 * de ventana, una sala que no es nuestra). Lo que sí se registra es el motivo,
 * para poder responder "por qué no se grabó" sin adivinar.
 */
async function intentarArranqueAutomatico(roomName: string | undefined): Promise<void> {
  const sessionId = sessionIdDeSala(roomName);
  if (!sessionId) return; // no es una sala nuestra: ni se registra, es ruido normal.

  // El interruptor se mira ANTES de ir a la base: apagado, cada ingreso a
  // cualquier sala costaría una consulta para nada.
  if (!isEgressEnabled()) return;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("class_sessions")
    .select("id, cohort_id, starts_at, ends_at, modality, status")
    .eq("id", sessionId)
    .maybeSingle();

  // Un fallo de base NO es lo mismo que "no es nuestra clase", y confundirlos es
  // exactamente la ceguera que este cambio vino a eliminar.
  if (error) {
    console.error("[webhooks/livekit] no se pudo leer la clase", sessionId, error.message);
    return;
  }
  if (!data) {
    console.warn("[webhooks/livekit] sala sin clase:", sessionId);
    return;
  }

  const sesion = data as {
    id: string;
    cohort_id: string;
    starts_at: string;
    ends_at: string;
    modality: string | null;
    status: string | null;
  };

  // Las mismas dos condiciones que gobiernan la sala. Se repiten acá porque el
  // webhook entra por fuera de la app: LiveKit avisa de CUALQUIER sala, incluida
  // una que alguien abra con un token viejo fuera de horario.
  const descartar = (motivo: string) => {
    console.warn("[webhooks/livekit] no se graba", sesion.id, "→", motivo);
  };
  if (!isLiveModality(sesion.modality)) return descartar("no es una clase en vivo");
  if (sesion.status === "cancelled") return descartar("clase cancelada");
  const ahora = new Date();
  if (!isWithinRoomWindow(sesion, ahora)) return descartar("fuera de la ventana");

  // La sala abre 30 min ANTES para probar cámara y audio; grabar desde ahí es
  // un error caro: si un alumno entra temprano y luego se va, la sala se vacía,
  // el egress se completa y esa grabación de una sala vacía se ingesta como la
  // repetición de la clase. Cuando la clase de verdad empieza, el guardia de
  // "ya grabada" la bloquea y la clase real NO se graba nunca.
  if (ahora < new Date(sesion.starts_at)) return descartar("la clase todavía no empieza");

  const res = await iniciarGrabacionDeSesion(admin, {
    sessionId: sesion.id,
    room: roomNameForSession(sesion.id),
    // Sin autor: la encendió el sistema, no una persona. Queda distinguible de
    // las que prendió alguien a mano.
    startedBy: null,
    automatico: true,
  });

  if (!res.ok && res.motivo !== "deshabilitado") {
    console.warn("[webhooks/livekit] no se pudo arrancar la grabación:", sesion.id, res.motivo);
  }
}
