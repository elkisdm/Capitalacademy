import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getEvaluationState } from "@/lib/classroom/evaluation-window";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type AdminClient = ReturnType<typeof createAdminClient>;

export type EvaluationForStudent = {
  id: string;
  program_id: string;
  scope: "final" | "module" | "lesson" | "session";
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
 *   1. La evaluación debe existir, estar ACTIVA y dentro de su ventana de
 *      programación (opens_at/closes_at — migración 0070). Este es "el gate
 *      que de verdad manda": bypassea RLS (service-role), a diferencia de
 *      `evaluations_student_select` que solo protege el acceso directo.
 *   2. El alumno debe tener matrícula activa en el programa de la evaluación.
 * Devuelve la evaluación + el enrollmentId, o un error tipado. Reutilizado por
 * los tres endpoints del alumno (estado / start / submit) para no repetir el
 * chequeo de tenant ni el de ventana.
 *
 * `opts.ignoreClosesAt` (D5, ver ADR-0016): un intento ya iniciado siempre debe
 * poder entregarse aunque `closes_at` ya haya pasado — cerrarlo en `submit` le
 * "quemaría" el intento sin nota. Lo usa únicamente el endpoint de submit.
 */
export async function resolveEvaluationAccess(
  supabase: ServerClient,
  admin: AdminClient,
  userId: string,
  evaluationId: string,
  opts?: { ignoreClosesAt?: boolean },
): Promise<EvalAccess> {
  const { data: evaluation } = await admin
    .from("evaluations")
    .select(
      "id, program_id, scope, title, passing_grade_pct, questions_per_attempt, max_attempts, time_limit_minutes, is_active, opens_at, closes_at",
    )
    .eq("id", evaluationId)
    .single();

  if (!evaluation) {
    return { ok: false, status: 404, error: "Evaluación no disponible" };
  }

  const state = getEvaluationState(evaluation, new Date());
  if (state === "draft" || state === "scheduled") {
    return { ok: false, status: 404, error: "Evaluación no disponible" };
  }
  if (state === "closed" && !opts?.ignoreClosesAt) {
    return { ok: false, status: 403, error: "Esta evaluación ya cerró" };
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
      scope: evaluation.scope as EvaluationForStudent["scope"],
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
