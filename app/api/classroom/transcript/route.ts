import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyEnrollment } from "@/lib/classroom/verify-enrollment";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // --- Validation -----------------------------------------------------------
  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get("lessonId");
  const format = searchParams.get("format") ?? "vtt";

  if (!lessonId) {
    return NextResponse.json(
      { error: "lessonId es requerido" },
      { status: 422 },
    );
  }

  if (format !== "vtt" && format !== "txt") {
    return NextResponse.json(
      { error: "format debe ser 'vtt' o 'txt'" },
      { status: 422 },
    );
  }

  // --- Authorization: verify lesson exists + user is enrolled ---------------
  const enrollmentId = await verifyEnrollment(user.id, lessonId);

  if (!enrollmentId) {
    return NextResponse.json(
      { error: "Lección no encontrada o no tienes matrícula activa" },
      { status: 403 },
    );
  }

  // --- Fetch transcript -----------------------------------------------------
  const { data: transcript, error } = await supabase
    .from("lesson_transcripts")
    .select("content_text, content_vtt")
    .eq("lesson_id", lessonId)
    .eq("status", "ready")
    .single();

  if (error || !transcript) {
    return NextResponse.json(
      { error: "Transcripción no disponible" },
      { status: 404 },
    );
  }

  const content =
    format === "vtt" ? transcript.content_vtt : transcript.content_text;

  if (!content) {
    return NextResponse.json(
      { error: "Transcripción no disponible" },
      { status: 404 },
    );
  }

  // --- Response with caching ------------------------------------------------
  const contentType =
    format === "vtt" ? "text/vtt; charset=utf-8" : "text/plain; charset=utf-8";

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
