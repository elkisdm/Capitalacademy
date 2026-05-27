import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { correctTranscript } from "@/lib/classroom/correct-transcript";

export const runtime = "nodejs";

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
  };
};

export async function POST(req: Request) {
  const webhookSecret = process.env.MUX_WEBHOOK_SECRET;
  if (webhookSecret) {
    const signature = req.headers.get("mux-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
  }

  let event: MuxWebhookEvent;
  try {
    event = (await req.json()) as MuxWebhookEvent;
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
      })
      .eq("mux_upload_id", upload_id);

    if (error) {
      console.error("Mux webhook: failed to update lesson", error);
      return NextResponse.json(
        { error: "DB update failed" },
        { status: 500 },
      );
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
