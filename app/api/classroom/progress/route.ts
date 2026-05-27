import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeServerProgress } from "@/lib/classroom/progress";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { lessonId, playbackPositionSeconds, durationSeconds } = body as {
    lessonId?: string;
    playbackPositionSeconds?: number;
    durationSeconds?: number;
  };

  if (
    !lessonId ||
    typeof playbackPositionSeconds !== "number" ||
    typeof durationSeconds !== "number" ||
    durationSeconds <= 0
  ) {
    return NextResponse.json(
      { error: "lessonId, playbackPositionSeconds, y durationSeconds son requeridos" },
      { status: 422 },
    );
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, module_id, program_modules(program_id)")
    .eq("id", lessonId)
    .single();

  if (!lesson) {
    return NextResponse.json({ error: "Lección no encontrada" }, { status: 404 });
  }

  const programModule = lesson.program_modules as { program_id: string } | null;
  if (!programModule) {
    return NextResponse.json({ error: "Módulo no encontrado" }, { status: 404 });
  }

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("id")
    .eq("program_id", programModule.program_id)
    .in("status", ["active", "planned"])
    .limit(1)
    .single();

  if (!cohort) {
    return NextResponse.json({ error: "Cohorte no encontrada" }, { status: 404 });
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

  const { data: existing } = await supabase
    .from("video_progress")
    .select("max_position_seconds, completed, completed_at")
    .eq("enrollment_id", enrollment.id)
    .eq("lesson_id", lessonId)
    .single();

  const progress = computeServerProgress(existing, {
    playback_position_seconds: Math.floor(playbackPositionSeconds),
    duration_seconds: Math.floor(durationSeconds),
  });

  const completedAt =
    progress.completed && !existing?.completed_at
      ? new Date().toISOString()
      : existing?.completed_at ?? null;

  const { data: upserted, error } = await supabase
    .from("video_progress")
    .upsert(
      {
        enrollment_id: enrollment.id,
        lesson_id: lessonId,
        ...progress,
        completed_at: completedAt,
        source: "player" as const,
      },
      { onConflict: "enrollment_id,lesson_id" },
    )
    .select("watch_percentage, completed, max_position_seconds, playback_position_seconds")
    .single();

  if (error) {
    console.error("video_progress upsert error", error);
    return NextResponse.json(
      { error: "Error al guardar progreso" },
      { status: 500 },
    );
  }

  return NextResponse.json(upserted);
}
