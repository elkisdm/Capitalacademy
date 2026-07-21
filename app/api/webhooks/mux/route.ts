import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { correctTranscript } from "@/lib/classroom/correct-transcript";
import { generateLessonSummary } from "@/lib/classroom/generate-summary";
import { generateLessonChapters } from "@/lib/classroom/generate-chapters";
import {
  dispatchCapacitacionFollowup,
  dispatchRecordingAvailableNotification,
} from "@/lib/classroom/recording-notifications";
import { pickSmartThumbnailTime } from "@/lib/mux/smart-thumbnail";
import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
// Debe quedar por debajo de RETRY_STALE_MS (10 min, ver lib/classroom/
// recording-notifications.ts) para que el cron de reconciliación pueda
// distinguir una corrida crasheada de una todavía en curso.
export const maxDuration = 300;

/** Max age for webhook signatures (5 minutes) to prevent replay attacks */
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

type MuxWebhookEvent = {
  type: string;
  data: {
    id: string;
    upload_id?: string;
    playback_ids?: Array<{ id: string; policy: string }>;
    duration?: number;
    status?: string;
    // track.ready fields
    asset_id?: string;
    text_type?: string;
    text_source?: string;
    language_code?: string;
    name?: string;
    // errored fields
    errors?: { type?: string; messages?: string[] };
  };
};

/**
 * Verify Mux webhook signature using HMAC-SHA256.
 * Header format: t=<timestamp>,v1=<signature>
 */
function verifyMuxSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const parts = signatureHeader.split(",");
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const signaturePart = parts.find((p) => p.startsWith("v1="));

  if (!timestampPart || !signaturePart) return false;

  const timestamp = timestampPart.slice(2);
  const receivedSignature = signaturePart.slice(3);

  // Replay attack prevention: reject signatures older than 5 minutes
  const timestampMs = parseInt(timestamp, 10) * 1000;
  if (isNaN(timestampMs) || Date.now() - timestampMs > SIGNATURE_MAX_AGE_MS) {
    return false;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  const expected = Buffer.from(expectedSignature, "hex");
  const received = Buffer.from(receivedSignature, "hex");

  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

export async function POST(req: Request) {
  // Read raw body FIRST for signature verification, then parse as JSON
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const webhookSecret = process.env.MUX_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers.get("mux-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    if (!verifyMuxSignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 },
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    // Fail-closed: en producción NUNCA se procesa un webhook sin firma. Sin el
    // secret, un POST no autenticado podría mutar lecciones y disparar correos.
    console.error(
      "MUX_WEBHOOK_SECRET ausente en producción — webhook rechazado (fail-closed)",
    );
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  } else {
    console.warn(
      "MUX_WEBHOOK_SECRET is not set — skipping signature verification (development only)",
    );
  }

  let event: MuxWebhookEvent;
  try {
    event = JSON.parse(rawBody) as MuxWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (event.type === "video.asset.ready") {
    const { id: assetId, upload_id, playback_ids, duration } = event.data;

    if (!upload_id) {
      return NextResponse.json({ received: true });
    }

    const playbackId = playback_ids?.[0]?.id ?? null;
    const durationSeconds = duration ? Math.round(duration) : null;

    const supabase = createAdminClient();

    // Idempotencia: si Mux reentrega este webhook (redelivery) y ya elegimos
    // una miniatura inteligente antes, reúsala tal cual y no vuelvas a llamar
    // a la IA (evita costo y llamadas duplicadas a OpenAI).
    const { data: existingLesson } = await supabase
      .from("lessons")
      .select("thumbnail_url")
      .eq("mux_upload_id", upload_id)
      .maybeSingle();

    // Miniatura: intenta que la IA elija el frame más atractivo ANTES del update.
    // Si no logra elegir (o falla/expira), cae al frame default de Mux. Este paso
    // NUNCA rompe el flujo: pickSmartThumbnailTime jamás lanza y responde en <8s.
    let thumbnailUrl: string | null = null;
    if (existingLesson?.thumbnail_url?.includes("?time=")) {
      thumbnailUrl = existingLesson.thumbnail_url;
    } else if (playbackId) {
      const smartTime =
        durationSeconds != null
          ? await pickSmartThumbnailTime(playbackId, durationSeconds)
          : null;
      thumbnailUrl =
        smartTime != null
          ? `https://image.mux.com/${playbackId}/thumbnail.webp?time=${smartTime}`
          : `https://image.mux.com/${playbackId}/thumbnail.webp`;
    }

    const { data: updatedLessons, error } = await supabase
      .from("lessons")
      .update({
        mux_asset_id: assetId,
        mux_playback_id: playbackId,
        video_duration_seconds: durationSeconds,
        thumbnail_url: thumbnailUrl,
        // El asset quedó listo: limpia cualquier error de procesamiento previo.
        mux_error: null,
      })
      .eq("mux_upload_id", upload_id)
      .select("id");

    if (error) {
      console.error("Mux webhook: failed to update lesson", error);
      return NextResponse.json(
        { error: "DB update failed" },
        { status: 500 },
      );
    }

    // Si esta lección es la grabación de una sesión en vivo, avisa a los
    // inscritos activos de la cohorte que ya pueden verla: CAP-CI usa su
    // propio seguimiento post-clase (con CTA a programa pago); el resto de
    // los programas usa la notificación genérica. Ambas funciones filtran por
    // programa de forma mutuamente excluyente (sin doble envío) y son
    // idempotentes y tolerantes a fallos.
    const lessonId = (updatedLessons as Array<{ id: string }> | null)?.[0]?.id;
    if (lessonId) {
      await dispatchCapacitacionFollowup(supabase, lessonId);
      await dispatchRecordingAvailableNotification(supabase, lessonId);
    }
  }

  // Mux falló al subir o procesar el video: registra el motivo en la lección
  // para que la UI lo muestre (en vez de quedar esperando un asset que no vendrá).
  if (
    event.type === "video.upload.errored" ||
    event.type === "video.asset.errored"
  ) {
    const supabase = createAdminClient();
    const reason =
      event.data.errors?.messages?.join(" · ") ??
      (event.type === "video.upload.errored"
        ? "La subida del video falló en Mux."
        : "Mux no pudo procesar el video.");

    // upload.errored: data.id ES el upload id. asset.errored: trae upload_id
    // (y, si no, el asset id ya persistido como mux_asset_id).
    const uploadId =
      event.type === "video.upload.errored"
        ? event.data.id
        : event.data.upload_id;

    if (uploadId) {
      await supabase
        .from("lessons")
        .update({ mux_error: reason })
        .eq("mux_upload_id", uploadId);
    } else {
      await supabase
        .from("lessons")
        .update({ mux_error: reason })
        .eq("mux_asset_id", event.data.id);
    }
  }

  if (event.type === "video.asset.deleted") {
    const supabase = createAdminClient();

    await supabase
      .from("lessons")
      .update({
        mux_asset_id: null,
        mux_playback_id: null,
        mux_upload_id: null,
        video_duration_seconds: null,
        thumbnail_url: null,
      })
      .eq("mux_asset_id", event.data.id);
  }

  if (event.type === "video.asset.track.ready") {
    const {
      asset_id: assetId,
      id: trackId,
      text_type,
      language_code,
    } = event.data;

    if (text_type === "subtitles" && assetId) {
      const supabase = createAdminClient();

      // Look up lesson by mux_asset_id
      const { data: lesson } = await supabase
        .from("lessons")
        .select("id, mux_playback_id")
        .eq("mux_asset_id", assetId)
        .single();

      if (lesson) {
        // Store the track ID on the lesson
        const { error: trackUpdateError } = await supabase
          .from("lessons")
          .update({ mux_track_id: trackId })
          .eq("id", lesson.id);

        if (trackUpdateError) {
          console.error(
            "Mux webhook: failed to store mux_track_id for lesson",
            lesson.id,
            trackUpdateError,
          );
          return NextResponse.json(
            { error: "DB update failed" },
            { status: 500 },
          );
        }

        // Fetch transcript text and VTT from Mux
        let contentText: string | null = null;
        let contentVtt: string | null = null;

        if (lesson.mux_playback_id) {
          const baseUrl = `https://stream.mux.com/${lesson.mux_playback_id}/text/${trackId}`;

          const [txtRes, vttRes] = await Promise.all([
            fetch(`${baseUrl}.txt`),
            fetch(`${baseUrl}.vtt`),
          ]);

          if (txtRes.ok) contentText = await txtRes.text();
          if (vttRes.ok) contentVtt = await vttRes.text();
        }

        // Upsert into lesson_transcripts
        const { error: transcriptUpsertError } = await supabase
          .from("lesson_transcripts")
          .upsert(
            {
              lesson_id: lesson.id,
              status: "ready",
              language: language_code ?? "es",
              generated_at: new Date().toISOString(),
              content_text: contentText,
              content_vtt: contentVtt,
            },
            { onConflict: "lesson_id,language" },
          );

        if (transcriptUpsertError) {
          console.error(
            "Mux webhook: failed to upsert lesson_transcripts for lesson",
            lesson.id,
            transcriptUpsertError,
          );
          return NextResponse.json(
            { error: "DB update failed" },
            { status: 500 },
          );
        }

        // Post-procesado de IA: corrección de la transcripción, glosario/resumen
        // y capítulos. Mismo pipeline que la regeneración manual
        // (/api/admin/generate-summary, /api/admin/generate-chapters); aplica por
        // igual a lecciones pregrabadas y a la lección-repetición de una clase en
        // vivo (class_sessions.lesson_id → lessons.kind='recorded', migración 0041).
        //
        // Se AWAITEA dentro del handler (maxDuration=300): en serverless la
        // instancia se congela al responder 200, así que un fire-and-forget mata
        // estas promesas en vuelo y deja la clase sin capítulos/resumen/corrección.
        // allSettled para que el fallo de una no impida las demás; los huecos que
        // igual queden se reconcilian con scripts/backfill-lesson-ai.ts.
        const aiTasks: Array<Promise<unknown>> = [];
        if (contentVtt) {
          aiTasks.push(
            correctTranscript(lesson.id).catch((err) => {
              console.error(
                "Mux webhook: auto-correction failed for lesson",
                lesson.id,
                err,
              );
            }),
          );
        }
        if (contentText) {
          aiTasks.push(
            generateLessonSummary(lesson.id).catch((err) => {
              console.error(
                "Mux webhook: auto-summary failed for lesson",
                lesson.id,
                err,
              );
            }),
            generateLessonChapters(lesson.id).catch((err) => {
              console.error(
                "Mux webhook: auto-chapters failed for lesson",
                lesson.id,
                err,
              );
            }),
          );
        }
        if (aiTasks.length > 0) {
          await Promise.allSettled(aiTasks);
        }
      } else {
        console.error(
          "Mux webhook: no lesson found for asset_id",
          assetId,
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}
