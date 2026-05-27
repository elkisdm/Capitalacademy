import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function requireStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ops", "admin"].includes(profile.system_role)) {
    return null;
  }
  return user;
}

/**
 * GET /api/admin/transcript-segments?lessonId=xxx&needsReview=true
 * Fetch transcript segments for a lesson, optionally filtered to those needing review.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const caller = await requireStaff(supabase);
  if (!caller) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get("lessonId");
  const needsReview = searchParams.get("needsReview");

  if (!lessonId) {
    return NextResponse.json(
      { error: "lessonId es requerido como query param" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  let query = admin
    .from("transcript_segments")
    .select("*, lesson_transcripts!inner(lesson_id)")
    .eq("lesson_transcripts.lesson_id", lessonId)
    .order("segment_index", { ascending: true });

  if (needsReview === "true") {
    query = query.eq("needs_review", true);
  }

  const { data: segments, error } = await query;

  if (error) {
    console.error("transcript_segments fetch error", error);
    return NextResponse.json(
      { error: "Error al obtener segmentos" },
      { status: 500 },
    );
  }

  return NextResponse.json({ segments });
}

/**
 * PATCH /api/admin/transcript-segments
 * Update a single segment's corrected text, then rebuild the full transcript.
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const caller = await requireStaff(supabase);
  if (!caller) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { segmentId, correctedText } = body as {
    segmentId?: string;
    correctedText?: string;
  };

  if (!segmentId || correctedText == null) {
    return NextResponse.json(
      { error: "segmentId y correctedText son requeridos" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  // 1. Update the segment
  const { data: updated, error: updateErr } = await admin
    .from("transcript_segments")
    .update({
      corrected_text: correctedText,
      manually_edited: true,
      edited_by: caller.id,
      edited_at: new Date().toISOString(),
      needs_review: false,
    })
    .eq("id", segmentId)
    .select("*, lesson_transcripts!inner(id, lesson_id)")
    .single();

  if (updateErr || !updated) {
    console.error("transcript_segment update error", updateErr);
    return NextResponse.json(
      { error: "Error al actualizar segmento" },
      { status: 500 },
    );
  }

  // 2. Rebuild the full corrected transcript
  const transcriptId = (
    updated.lesson_transcripts as unknown as { id: string }
  ).id;

  const { data: allSegments, error: fetchErr } = await admin
    .from("transcript_segments")
    .select("segment_index, start_seconds, end_seconds, original_text, corrected_text")
    .eq("transcript_id", transcriptId)
    .order("segment_index", { ascending: true });

  if (fetchErr || !allSegments) {
    console.error("rebuild fetch error", fetchErr);
    return NextResponse.json(
      { error: "Error al reconstruir transcripcion" },
      { status: 500 },
    );
  }

  // Build full corrected text and VTT
  const correctedLines: string[] = [];
  const vttLines: string[] = ["WEBVTT", ""];

  for (const seg of allSegments) {
    const text = seg.corrected_text ?? seg.original_text;
    correctedLines.push(text);

    vttLines.push(String(seg.segment_index + 1));
    vttLines.push(`${formatVTTTime(seg.start_seconds)} --> ${formatVTTTime(seg.end_seconds)}`);
    vttLines.push(text);
    vttLines.push("");
  }

  const correctedFullText = correctedLines.join("\n");
  const correctedVtt = vttLines.join("\n");

  // Count remaining segments needing review
  const { count: reviewCount } = await admin
    .from("transcript_segments")
    .select("id", { count: "exact", head: true })
    .eq("transcript_id", transcriptId)
    .eq("needs_review", true);

  // 3. Update the parent lesson_transcripts record
  const { error: transcriptUpdateErr } = await admin
    .from("lesson_transcripts")
    .update({
      corrected_text: correctedFullText,
      corrected_vtt: correctedVtt,
      segments_needing_review: reviewCount ?? 0,
    })
    .eq("id", transcriptId);

  if (transcriptUpdateErr) {
    console.error("lesson_transcripts update error", transcriptUpdateErr);
    return NextResponse.json(
      { error: "Error al actualizar transcripcion completa" },
      { status: 500 },
    );
  }

  return NextResponse.json({ segment: updated });
}

/** Convert seconds to VTT timestamp format (HH:MM:SS.mmm) */
function formatVTTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}
