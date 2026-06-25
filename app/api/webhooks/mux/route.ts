import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { correctTranscript } from "@/lib/classroom/correct-transcript";
import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

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
    const thumbnailUrl = playbackId
      ? `https://image.mux.com/${playbackId}/thumbnail.webp`
      : null;

    const supabase = createAdminClient();

    const { error } = await supabase
      .from("lessons")
      .update({
        mux_asset_id: assetId,
        mux_playback_id: playbackId,
        video_duration_seconds: durationSeconds,
        thumbnail_url: thumbnailUrl,
        // El asset quedó listo: limpia cualquier error de procesamiento previo.
        mux_error: null,
      } as never)
      .eq("mux_upload_id", upload_id);

    if (error) {
      console.error("Mux webhook: failed to update lesson", error);
      return NextResponse.json(
        { error: "DB update failed" },
        { status: 500 },
      );
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
        .update({ mux_error: reason } as never)
        .eq("mux_upload_id", uploadId);
    } else {
      await supabase
        .from("lessons")
        .update({ mux_error: reason } as never)
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
        await supabase
          .from("lessons")
          .update({ mux_track_id: trackId })
          .eq("id", lesson.id);

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
        await supabase.from("lesson_transcripts").upsert(
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

        // Auto-trigger transcript correction (fire-and-forget)
        if (contentVtt) {
          correctTranscript(lesson.id).catch((err) =>
            console.error(
              "Mux webhook: auto-correction failed for lesson",
              lesson.id,
              err,
            ),
          );
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
