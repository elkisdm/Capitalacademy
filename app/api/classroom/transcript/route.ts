import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, module_id, program_modules(program_id)")
    .eq("id", lessonId)
    .single();

  if (!lesson) {
    return NextResponse.json(
      { error: "Lección no encontrada" },
      { status: 404 },
    );
  }

  const programModule = lesson.program_modules as {
    program_id: string;
  } | null;
  if (!programModule) {
    return NextResponse.json(
      { error: "Módulo no encontrado" },
      { status: 404 },
    );
  }

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("id")
    .eq("program_id", programModule.program_id)
    .in("status", ["active", "planned"])
    .limit(1)
    .single();

  if (!cohort) {
    return NextResponse.json(
      { error: "Cohorte no encontrada" },
      { status: 404 },
    );
  }

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("student_id", user.id)
    .eq("cohort_id", cohort.id)
    .eq("status", "active")
    .single();

  if (!enrollment) {
    return NextResponse.json(
      { error: "No tienes matrícula activa en esta cohorte" },
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
      "Cache-Control": "public, max-age=3600",
    },
  });
}
