import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type MuxWebhookEvent = {
  type: string;
  data: {
    id: string;
    upload_id?: string;
    playback_ids?: Array<{ id: string; policy: string }>;
    duration?: number;
    status?: string;
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

  return NextResponse.json({ received: true });
}
