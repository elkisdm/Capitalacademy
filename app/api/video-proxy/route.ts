import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const playbackId = searchParams.get("id");

  if (!playbackId || !/^[a-zA-Z0-9]+$/.test(playbackId)) {
    return NextResponse.json({ error: "Invalid playback ID" }, { status: 400 });
  }

  // --- Authentication ---
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Enrollment verification ---
  // Use admin client to look up lesson/module (RLS may block these tables)
  const admin = createAdminClient();

  // Find the lesson and its module's program_id by playback ID
  const { data: lesson } = await admin
    .from("lessons")
    .select("id, module_id, program_modules(program_id)")
    .eq("mux_playback_id", playbackId)
    .single();

  if (!lesson) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const programModule = lesson.program_modules as unknown as {
    program_id: string;
  } | null;

  if (!programModule) {
    return NextResponse.json(
      { error: "Module not found" },
      { status: 404 },
    );
  }

  // Check if the user is enrolled in ANY active cohort for this program
  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id, cohorts!inner(program_id)")
    .eq("student_id", user.id)
    .eq("cohorts.program_id", programModule.program_id)
    .in("status", ["active", "completed"])
    .limit(1)
    .maybeSingle();

  if (!enrollment) {
    return NextResponse.json(
      { error: "Not enrolled in this program" },
      { status: 403 },
    );
  }

  // --- Proxy the video from Mux ---
  const muxUrl = `https://stream.mux.com/${playbackId}/medium.mp4`;

  const muxRes = await fetch(muxUrl);

  if (!muxRes.ok) {
    return NextResponse.json(
      { error: "Video not available", status: muxRes.status },
      { status: muxRes.status },
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", muxRes.headers.get("content-type") ?? "video/mp4");
  headers.set("Accept-Ranges", "bytes");
  if (muxRes.headers.get("content-length")) {
    headers.set("Content-Length", muxRes.headers.get("content-length")!);
  }
  headers.set("Cache-Control", "private, max-age=3600");

  return new NextResponse(muxRes.body, { status: 200, headers });
}
