import type { createAdminClient } from "@/lib/supabase/admin";
import { getMuxClient } from "@/lib/mux/client";
import { GRABACIONES_BUCKET } from "@/lib/livekit/egress";
import {
  ensureRecordingLesson,
  type RecordingSession,
} from "@/lib/classroom/ensure-recording-lesson";

/**
 * Ingesta a Mux del MP4 que dejó Egress (ADR-0034).
 *
 * Es el único punto donde el camino nativo se junta con el manual: a partir de
 * que el asset existe, manda el webhook de Mux y no hay una sola línea nueva
 * —transcripción, resumen, capítulos y el aviso al alumno ocurren igual que si
 * alguien hubiera subido el archivo a mano.
 *
 * El asset se configura EXACTAMENTE como en `/api/admin/mux/upload`. Si la
 * repetición nativa se configurara distinto, el alumno vería dos productos con
 * el mismo nombre.
 */

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Vida de la URL firmada que Mux usa para descargar el archivo.
 *
 * Mux descarga en minutos; una hora cubre reintentos de su lado con holgura.
 * La URL queda guardada en el registro `input` del asset en el dashboard de
 * Mux (cuenta compartida de la empresa), así que cada minuto extra de vida es
 * ventana para descargar el MP4 crudo sin pasar por la plataforma.
 */
export const INGEST_URL_EXPIRY_SEC = 3_600;

export type IngestResult =
  | { ok: true; estado: "ingesting"; muxAssetId: string; lessonId: string }
  /** No se ingestó, y no es un error que haya que reintentar. */
  | { ok: false; estado: "uploaded" | "ingesting" | "ready" | "failed" | null; motivo: string };

type RecordingRow = {
  id: string;
  session_id: string;
  status: string;
  storage_path: string | null;
  mux_asset_id: string | null;
};

async function marcarFallida(admin: Admin, recordingId: string, motivo: string) {
  await admin
    .from("session_recordings")
    .update({ status: "failed", error: motivo })
    .eq("id", recordingId);
}

export async function ingestRecording(admin: Admin, recordingId: string): Promise<IngestResult> {
  const { data: fila } = await admin
    .from("session_recordings")
    .select("id, session_id, status, storage_path, mux_asset_id")
    .eq("id", recordingId)
    .maybeSingle<RecordingRow>();

  if (!fila) return { ok: false, estado: null, motivo: "La grabación no existe." };
  if (!fila.storage_path) {
    await marcarFallida(admin, recordingId, "Egress no dejó ningún archivo.");
    return { ok: false, estado: "failed", motivo: "Egress no dejó ningún archivo." };
  }

  // Reserva-antes-de-actuar (mismo criterio que recording-notifications.ts y
  // ADR-0020): el update condicional es lo que hace que una reentrega del
  // webhook de LiveKit no cree un segundo asset en Mux. Si otra corrida ya la
  // tomó, esta se va sin hacer nada.
  // `ingested_at` se estampa AL RESERVAR, no al terminar: es el reloj contra el
  // que el cron decide si una ingesta está colgada. Si se estampara al final,
  // el cron mediría desde el inicio de la GRABACIÓN (horas antes) y podría
  // preemptar una ingesta en vuelo, creando dos assets en Mux del mismo MP4.
  const { data: reservada } = await admin
    .from("session_recordings")
    .update({ status: "ingesting", ingested_at: new Date().toISOString() })
    .eq("id", recordingId)
    .eq("status", "uploaded")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!reservada) {
    return {
      ok: false,
      estado: fila.status as "ingesting" | "ready" | "failed",
      motivo: "La grabación ya fue tomada por otra corrida.",
    };
  }

  const { data: session } = await admin
    .from("class_sessions")
    .select("id, module_id, lesson_id, title")
    .eq("id", fila.session_id)
    .maybeSingle<RecordingSession>();

  if (!session) {
    await marcarFallida(admin, recordingId, "La clase de esta grabación ya no existe.");
    return { ok: false, estado: "failed", motivo: "La clase de esta grabación ya no existe." };
  }

  const leccion = await ensureRecordingLesson(admin, session);
  if (!leccion.ok) {
    // Accionable a propósito: quien lo lea tiene que saber qué hacer para que el
    // reintento funcione. El archivo se conserva los 14 días de retención.
    const motivo =
      leccion.reason === "module_missing"
        ? "Asigna un módulo a la sesión para publicar la repetición."
        : "No se pudo preparar la lección de la repetición.";
    await marcarFallida(admin, recordingId, motivo);
    return { ok: false, estado: "failed", motivo };
  }

  const { data: lesson } = await admin
    .from("lessons")
    .select("id, mux_asset_id, mux_upload_id")
    .eq("id", leccion.lessonId)
    .maybeSingle<{ id: string; mux_asset_id: string | null; mux_upload_id: string | null }>();

  if (lesson?.mux_asset_id || lesson?.mux_upload_id) {
    // Pisar una repetición que ya existe —y que puede tener progreso de
    // alumnos— sería destruir datos sin que nadie lo pidiera. La fila queda
    // `failed` (estado TERMINAL) con el motivo a la vista: si volviera a
    // `uploaded`, la reconciliación la reintentaría por siempre y el MP4
    // jamás saldría del bucket (la limpieza solo barre `ready`/`failed`).
    // El archivo se conserva la ventana de retención por si el equipo decide
    // reemplazar la repetición manual dentro de esos días.
    const motivo = "La clase ya tiene una repetición subida.";
    await marcarFallida(admin, recordingId, motivo);
    return { ok: false, estado: "failed", motivo };
  }

  const { data: firmada, error: firmaError } = await admin.storage
    .from(GRABACIONES_BUCKET)
    .createSignedUrl(fila.storage_path, INGEST_URL_EXPIRY_SEC);

  if (firmaError || !firmada?.signedUrl) {
    const motivo = "No se pudo firmar la URL del archivo de la grabación.";
    console.error("[ingestRecording] createSignedUrl falló", firmaError);
    await marcarFallida(admin, recordingId, motivo);
    return { ok: false, estado: "failed", motivo };
  }

  let assetId: string;
  try {
    const asset = await getMuxClient().video.assets.create({
      inputs: [
        {
          url: firmada.signedUrl,
          generated_subtitles: [{ language_code: "es", name: "Español CC" }],
        },
      ],
      // `playback_policies` es el campo vigente; `playback_policy` (el que usa
      // la subida manual) quedó deprecado en @mux/mux-node v14 y hace lo mismo.
      //
      // "public" EXPLÍCITO y no condicional: el playback sin firmar es la
      // decisión vigente de todo el producto (el player no firma URLs, y las
      // repeticiones subidas a mano —con las mismas caras y voces de alumnos—
      // ya son públicas). Firmar solo este camino rompería la reproducción.
      // Si algún día se firma, es un proyecto de TODA la cadena de playback,
      // no una línea acá.
      playback_policies: ["public"],
      video_quality: "basic",
      // Rendition MP4 estática para el fallback progresivo del player.
      static_renditions: [{ resolution: "highest" }],
    });
    assetId = asset.id;
  } catch (err) {
    const motivo = "Mux rechazó la grabación. El archivo se conserva para reintentar.";
    console.error("[ingestRecording] assets.create falló", err);
    await marcarFallida(admin, recordingId, motivo);
    return { ok: false, estado: "failed", motivo };
  }

  // El asset se escribe en la lección INMEDIATAMENTE: `video.asset.ready` puede
  // llegar en segundos y el webhook ubica la lección por este id (D4). Si esto
  // se demorara, la repetición quedaría colgada esperando un webhook que ya pasó.
  const { error: lessonError } = await admin
    .from("lessons")
    .update({ mux_asset_id: assetId, mux_error: null })
    .eq("id", leccion.lessonId);

  if (lessonError) {
    console.error("[ingestRecording] no se pudo enlazar el asset a la lección", lessonError);
  }

  // Guarda de estado: si otra corrida preemptó esta fila entremedio, su
  // mux_asset_id es el que vale — pisarlo dejaría el asset del ganador huérfano.
  const { data: escrita } = await admin
    .from("session_recordings")
    .update({
      status: "ingesting",
      mux_asset_id: assetId,
      ingested_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", recordingId)
    .eq("status", "ingesting")
    .is("mux_asset_id", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!escrita) {
    console.error(
      "[ingestRecording] otra corrida tomó la fila mientras se creaba el asset; queda un asset duplicado en Mux",
      { recordingId, assetId },
    );
    return { ok: false, estado: "ingesting", motivo: "Otra corrida completó la ingesta primero." };
  }

  return { ok: true, estado: "ingesting", muxAssetId: assetId, lessonId: leccion.lessonId };
}
