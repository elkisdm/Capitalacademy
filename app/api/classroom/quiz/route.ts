import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompletion } from "@/lib/classroom/quiz-runtime";

export const runtime = "nodejs";

/**
 * Estado del quiz para el alumno (gating). NO entrega preguntas: eso lo hace
 * POST /start, que persiste el set elegido por el servidor. Respuestas:
 *   { status: 'unconfigured' }                              — no hay quiz para el programa
 *   { status: 'passed', ... }                               — ya aprobó
 *   { status: 'locked_completion', currentPct, requiredPct, ... }
 *   { status: 'locked_attempts', attemptsUsed, maxAttempts }
 *   { status: 'ready', hasInProgress, config, attemptsUsed, attemptsRemaining, lastScore }
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");
  if (!programId) {
    return NextResponse.json({ error: "programId es requerido" }, { status: 422 });
  }

  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("id, status, cohorts!inner(program_id)")
    .eq("student_id", user.id)
    .eq("cohorts.program_id", programId)
    .eq("status", "active")
    .limit(1)
    .single();
  if (enrollmentError || !enrollment) {
    return NextResponse.json(
      { error: "No tienes una inscripcion activa en este programa" },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { data: config, error: configError } = await admin
    .from("quiz_configs")
    .select("*")
    .eq("program_id", programId)
    .eq("is_active", true)
    .single();
  if (configError || !config) {
    return NextResponse.json({ status: "unconfigured" });
  }

  const { data: attempts } = await admin
    .from("quiz_attempts")
    .select("id, passed, score_pct, completed_at")
    .eq("enrollment_id", enrollment.id)
    .eq("program_id", programId)
    .order("created_at", { ascending: false });

  const all = attempts ?? [];
  const completed = all.filter((a) => a.completed_at);
  const hasInProgress = all.some((a) => !a.completed_at);
  const lastScore =
    completed[0]?.score_pct != null ? Number(completed[0].score_pct) : undefined;

  if (completed.some((a) => a.passed)) {
    return NextResponse.json({ status: "passed", attemptsUsed: completed.length, lastScore });
  }

  const { currentPct, completedLessons, totalLessons } = await getCompletion(
    admin,
    programId,
    enrollment.id,
  );

  // Un intento en curso siempre puede reanudarse, aunque cambie el gate.
  if (!hasInProgress && currentPct < config.min_completion_pct) {
    return NextResponse.json({
      status: "locked_completion",
      currentPct,
      requiredPct: config.min_completion_pct,
      completedLessons,
      totalLessons,
    });
  }

  if (!hasInProgress && completed.length >= config.max_attempts) {
    return NextResponse.json({
      status: "locked_attempts",
      attemptsUsed: completed.length,
      maxAttempts: config.max_attempts,
    });
  }

  return NextResponse.json({
    status: "ready",
    hasInProgress,
    attemptsUsed: completed.length,
    attemptsRemaining: Math.max(0, config.max_attempts - completed.length),
    lastScore,
    config: {
      questionsPerAttempt: config.questions_per_attempt,
      passingGradePct: config.passing_grade_pct,
      maxAttempts: config.max_attempts,
      timeLimitMinutes: config.time_limit_minutes,
    },
  });
}
