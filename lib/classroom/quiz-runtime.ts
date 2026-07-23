import type { createAdminClient } from "@/lib/supabase/admin";

// Helpers server-side compartidos por las rutas del quiz del alumno
// (GET estado, POST /start, POST /submit). Centraliza el conteo de completitud
// y la selección/rehidratación de preguntas para que el set y el total los
// determine SIEMPRE el servidor (no el cliente).

type AdminClient = ReturnType<typeof createAdminClient>;

export type QuizQuestionPublic = {
  id: string;
  question_text: string;
  options: Record<string, string>;
  question_type: QuestionType;
};

export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "short_answer";

/** Respuesta del alumno por tipo: letra/valor único, set de letras, o texto libre. */
export type StudentAnswer = string | string[] | null | undefined;

/** Pregunta puntuable: solo lo que el servidor necesita para corregir. */
export type ScorableQuestion = {
  id: string;
  question_type: QuestionType;
  // jsonb persistido en quiz_questions.correct_answer:
  //   single_choice / true_false → "A"
  //   multiple_choice            → ["A","C"]
  //   short_answer               → ["respuesta aceptada", "sinónimo"]
  correct_answer: unknown;
};

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/** Normaliza texto para comparar respuestas cortas: sin espacios extremos,
 *  minúsculas y sin tildes. "  Él  " → "el". */
export function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value === null || value === undefined) return [];
  return [String(value)];
}

/**
 * Puntúa la respuesta de un alumno a una pregunta, server-side, según su tipo.
 * Devuelve `true` solo si es correcta. Una respuesta ausente cuenta como incorrecta.
 *
 *  - single_choice / true_false: igualdad exacta del valor único.
 *  - multiple_choice: el set elegido debe coincidir EXACTO con el set correcto
 *    (sin puntuación parcial en v0).
 *  - short_answer: el texto normalizado debe estar entre las respuestas aceptadas.
 */
export function scoreAnswer(question: ScorableQuestion, given: StudentAnswer): boolean {
  switch (question.question_type) {
    case "single_choice":
    case "true_false": {
      if (typeof given !== "string") return false;
      const correct = asStringArray(question.correct_answer)[0];
      return correct !== undefined && given === correct;
    }
    case "multiple_choice": {
      const correct = new Set(asStringArray(question.correct_answer));
      const chosen = new Set(
        Array.isArray(given) ? given.map((v) => String(v)) : given ? [String(given)] : [],
      );
      if (correct.size === 0 || chosen.size !== correct.size) return false;
      for (const c of correct) if (!chosen.has(c)) return false;
      return true;
    }
    case "short_answer": {
      if (typeof given !== "string" || given.trim() === "") return false;
      const accepted = asStringArray(question.correct_answer).map(normalizeText);
      return accepted.includes(normalizeText(given));
    }
    default:
      return false;
  }
}

/** Porcentaje de lecciones del programa completadas por la matrícula. */
export async function getCompletion(
  admin: AdminClient,
  programId: string,
  enrollmentId: string,
): Promise<{ currentPct: number; completedLessons: number; totalLessons: number }> {
  const { data: modules, error: modulesError } = await admin
    .from("program_modules")
    .select("id")
    .eq("program_id", programId);
  if (modulesError) {
    console.error("[getCompletion] error al leer program_modules", modulesError);
    throw modulesError;
  }
  const moduleIds = (modules ?? []).map((m) => m.id as string);

  const { count: totalCount, error: totalError } = await admin
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .in("module_id", moduleIds.length ? moduleIds : [NIL_UUID]);
  if (totalError) {
    console.error("[getCompletion] error al contar lessons", totalError);
    throw totalError;
  }

  const { count: completedCount, error: completedError } = await admin
    .from("video_progress")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId)
    .eq("completed", true);
  if (completedError) {
    console.error("[getCompletion] error al contar video_progress", completedError);
    throw completedError;
  }

  const totalLessons = totalCount ?? 0;
  const completedLessons = completedCount ?? 0;
  const currentPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  return { currentPct, completedLessons, totalLessons };
}

/** Selecciona N preguntas aleatorias del pool del programa (RPC con fallback JS). */
export async function selectRandomQuestions(
  admin: AdminClient,
  programId: string,
  limit: number,
): Promise<QuizQuestionPublic[]> {
  // as never: el RPC "get_random_quiz_questions" no existe en la base (no hay
  // migración que lo cree) — no está en los tipos generados. La llamada
  // siempre cae al fallback en JS de abajo; se deja documentado el gap.
  const { data: rpcData, error: rpcError } = await admin.rpc(
    "get_random_quiz_questions" as never,
    { p_program_id: programId, p_limit: limit } as never,
  );

  if (!rpcError && rpcData) {
    return (
      rpcData as Array<{
        id: string;
        question_text: string;
        options: Record<string, string>;
        question_type?: QuestionType;
      }>
    ).map((q) => ({
      id: q.id,
      question_text: q.question_text,
      options: q.options,
      question_type: q.question_type ?? "single_choice",
    }));
  }

  const { data: all, error: poolError } = await admin
    .from("quiz_questions")
    .select("id, question_text, options, question_type")
    .eq("program_id", programId);
  if (poolError) {
    console.error("[selectRandomQuestions] fallo el pool", { programId, error: poolError });
    throw poolError;
  }

  const pool = [...(all ?? [])];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit).map((q) => ({
    id: q.id as string,
    question_text: q.question_text as string,
    options: q.options as Record<string, string>,
    question_type: (q.question_type as QuestionType) ?? "single_choice",
  }));
}

/** Rehidrata texto/opciones de preguntas ya presentadas (reanudar), SIN correct_option. */
export async function getPresentedQuestions(
  admin: AdminClient,
  programId: string,
  questionIds: string[],
): Promise<QuizQuestionPublic[]> {
  if (questionIds.length === 0) return [];
  const { data, error } = await admin
    .from("quiz_questions")
    .select("id, question_text, options, question_type")
    .eq("program_id", programId)
    .in("id", questionIds);
  if (error) {
    console.error("[getPresentedQuestions] error al rehidratar preguntas", error);
    throw error;
  }

  const byId = new Map((data ?? []).map((q) => [q.id as string, q]));
  return questionIds
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => ({
      id: q.id as string,
      question_text: q.question_text as string,
      options: q.options as Record<string, string>,
      question_type: (q.question_type as QuestionType) ?? "single_choice",
    }));
}

/* -------------------------------------------------------------------------- */
/* Selección por EVALUACIÓN (quizzes por clase — Fase 3).                       */
/* Misma forma pública (sin respuestas) que el final, pero el pool sale de     */
/* `evaluation_id`, no del programa completo.                                  */
/* -------------------------------------------------------------------------- */

/** Selecciona hasta `limit` preguntas aleatorias del pool de una evaluación.
 *  Si `limit` es null/undefined, devuelve todas (orden aleatorio). */
export async function selectEvaluationQuestions(
  admin: AdminClient,
  evaluationId: string,
  limit?: number | null,
): Promise<QuizQuestionPublic[]> {
  const { data: all, error } = await admin
    .from("quiz_questions")
    .select("id, question_text, options, question_type")
    .eq("evaluation_id", evaluationId);
  if (error) {
    console.error("[selectEvaluationQuestions] fallo el pool", { evaluationId, error });
    throw error;
  }

  const pool = [...(all ?? [])];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const sliced = limit != null ? pool.slice(0, limit) : pool;
  return sliced.map((q) => ({
    id: q.id as string,
    question_text: q.question_text as string,
    options: q.options as Record<string, string>,
    question_type: (q.question_type as QuestionType) ?? "single_choice",
  }));
}

/** Rehidrata preguntas presentadas de una evaluación (reanudar), SIN respuestas. */
export async function getPresentedEvaluationQuestions(
  admin: AdminClient,
  evaluationId: string,
  questionIds: string[],
): Promise<QuizQuestionPublic[]> {
  if (questionIds.length === 0) return [];
  const { data, error } = await admin
    .from("quiz_questions")
    .select("id, question_text, options, question_type")
    .eq("evaluation_id", evaluationId)
    .in("id", questionIds);
  if (error) {
    console.error("[getPresentedEvaluationQuestions] error al rehidratar preguntas", error);
    throw error;
  }

  const byId = new Map((data ?? []).map((q) => [q.id as string, q]));
  return questionIds
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => ({
      id: q.id as string,
      question_text: q.question_text as string,
      options: q.options as Record<string, string>,
      question_type: (q.question_type as QuestionType) ?? "single_choice",
    }));
}

/** Trae las respuestas correctas (server-only) de las preguntas presentadas de
 *  una evaluación, para puntuar con `scoreAnswer`. NUNCA se envía al cliente. */
export async function getCorrectAnswers(
  admin: AdminClient,
  evaluationId: string,
  questionIds: string[],
): Promise<ScorableQuestion[]> {
  if (questionIds.length === 0) return [];
  const { data } = await admin
    .from("quiz_questions")
    .select("id, question_type, correct_answer, correct_option")
    .eq("evaluation_id", evaluationId)
    .in("id", questionIds);

  return (data ?? []).map((q) => ({
    id: q.id as string,
    question_type: (q.question_type as QuestionType) ?? "single_choice",
    // Compat: si correct_answer aún no está poblado, cae a correct_option.
    correct_answer: q.correct_answer ?? q.correct_option,
  }));
}
