import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type AdminClient = ReturnType<typeof createAdminClient>;

export type EvaluationForStudent = {
  id: string;
  program_id: string;
  scope: "final" | "module" | "lesson";
  title: string;
  passing_grade_pct: number;
  questions_per_attempt: number | null;
  max_attempts: number;
  time_limit_minutes: number | null;
};

export type EvalAccess =
  | { ok: true; evaluation: EvaluationForStudent; enrollmentId: string }
  | { ok: false; status: number; error: string };

/**
 * Resuelve el acceso de un alumno a una evaluación por clase:
 *   1. La evaluación debe existir y estar ACTIVA.
 *   2. El alumno debe tener matrícula activa en el programa de la evaluación.
 * Devuelve la evaluación + el enrollmentId, o un error tipado. Reutilizado por
 * los tres endpoints del alumno (estado / start / submit) para no repetir el
 * chequeo de tenant ni el de activación.
 */
export async function resolveEvaluationAccess(
  supabase: ServerClient,
  admin: AdminClient,
  userId: string,
  evaluationId: string,
): Promise<EvalAccess> {
  const { data: evaluation } = await admin
    .from("evaluations")
    .select(
      "id, program_id, scope, title, passing_grade_pct, questions_per_attempt, max_attempts, time_limit_minutes, is_active",
    )
    .eq("id", evaluationId)
    .single();

  if (!evaluation || !evaluation.is_active) {
    return { ok: false, status: 404, error: "Evaluación no disponible" };
  }

  // Acceso permanente al contenido (RN-049/050): un alumni con matrícula
  // 'completed' conserva acceso a sus evaluaciones formativas (práctica sin
  // certificado). Coincide con la policy RLS evaluations_student_select.
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, status, cohorts!inner(program_id)")
    .eq("student_id", userId)
    .eq("cohorts.program_id", evaluation.program_id)
    .in("status", ["active", "completed"])
    .limit(1)
    .single();

  if (!enrollment) {
    return { ok: false, status: 403, error: "No tienes una inscripción activa en este programa" };
  }

  return {
    ok: true,
    enrollmentId: enrollment.id,
    evaluation: {
      id: evaluation.id,
      program_id: evaluation.program_id,
      scope: evaluation.scope,
      title: evaluation.title,
      passing_grade_pct: evaluation.passing_grade_pct,
      questions_per_attempt: evaluation.questions_per_attempt,
      max_attempts: evaluation.max_attempts,
      time_limit_minutes: evaluation.time_limit_minutes,
    },
  };
}

export type EvalConfigPublic = {
  questionsPerAttempt: number | null;
  passingGradePct: number;
  maxAttempts: number;
  timeLimitMinutes: number | null;
};

export function toPublicConfig(ev: EvaluationForStudent): EvalConfigPublic {
  return {
    questionsPerAttempt: ev.questions_per_attempt,
    passingGradePct: ev.passing_grade_pct,
    maxAttempts: ev.max_attempts,
    timeLimitMinutes: ev.time_limit_minutes,
  };
}
