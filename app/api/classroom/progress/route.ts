import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { computeServerProgress } from "@/lib/classroom/progress";
import { verifyEnrollment } from "@/lib/classroom/verify-enrollment";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

const progressPatchSchema = z.object({
  lessonId: uuidLike,
  playbackPositionSeconds: z.number().int().min(0),
  durationSeconds: z.number().int().positive(),
});

const progressPostSchema = z.object({
  lessonId: uuidLike,
});

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

  const parsed = progressPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { lessonId, playbackPositionSeconds, durationSeconds } = parsed.data;

  const enrollmentId = await verifyEnrollment(user.id, lessonId);

  if (!enrollmentId) {
    return NextResponse.json(
      { error: "Lección no encontrada o no tienes matrícula activa" },
      { status: 403 },
    );
  }

  const enrollment = { id: enrollmentId };

  // Lee-computa-escribe en una función reintentable: una carrera con otro
  // flush concurrente para el mismo enrollment+lección (p.ej. el flush del
  // timer de 15s y el del evento pause casi simultáneos) puede toparse con
  // un lock transitorio en el upsert; un solo reintento alcanza porque para
  // entonces el otro flush ya liberó la fila.
  const upsertProgress = async () => {
    const { data: existing } = await supabase
      .from("video_progress")
      .select("max_position_seconds, completed, completed_at")
      .eq("enrollment_id", enrollment.id)
      .eq("lesson_id", lessonId)
      .maybeSingle();

    const progress = computeServerProgress(existing, {
      playback_position_seconds: Math.floor(playbackPositionSeconds),
      duration_seconds: Math.floor(durationSeconds),
    });

    const completedAt =
      progress.completed && !existing?.completed_at
        ? new Date().toISOString()
        : existing?.completed_at ?? null;

    return supabase
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
  };

  let { data: upserted, error } = await upsertProgress();

  if (error) {
    console.error("video_progress upsert error (reintentando)", error);
    ({ data: upserted, error } = await upsertProgress());
  }

  if (error) {
    console.error("video_progress upsert error", error);
    return NextResponse.json(
      { error: "Error al guardar progreso" },
      { status: 500 },
    );
  }

  return NextResponse.json(upserted);
}

export async function POST(req: Request) {
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

  const parsed = progressPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { lessonId } = parsed.data;

  const enrollmentId = await verifyEnrollment(user.id, lessonId);

  if (!enrollmentId) {
    return NextResponse.json(
      { error: "Lección no encontrada o no tienes matrícula activa" },
      { status: 403 },
    );
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select("video_duration_seconds")
    .eq("id", lessonId)
    .single();

  const duration = (lesson?.video_duration_seconds as number | null) ?? 0;

  const { data: existing } = await supabase
    .from("video_progress")
    .select("playback_position_seconds, max_position_seconds, duration_seconds")
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  const now = new Date().toISOString();

  const { data: upserted, error } = await supabase
    .from("video_progress")
    .upsert(
      {
        enrollment_id: enrollmentId,
        lesson_id: lessonId,
        playback_position_seconds: existing?.playback_position_seconds ?? duration,
        max_position_seconds: existing?.max_position_seconds ?? duration,
        duration_seconds: existing?.duration_seconds ?? duration,
        watch_percentage: 100,
        completed: true,
        completed_at: now,
        last_watched_at: now,
        source: "manual" as const,
      },
      { onConflict: "enrollment_id,lesson_id" },
    )
    .select("watch_percentage, completed")
    .single();

  if (error) {
    console.error("manual complete error", error);
    return NextResponse.json(
      { error: "Error al marcar como completada" },
      { status: 500 },
    );
  }

  return NextResponse.json(upserted);
}
