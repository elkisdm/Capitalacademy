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
};

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/** Porcentaje de lecciones del programa completadas por la matrícula. */
export async function getCompletion(
  admin: AdminClient,
  programId: string,
  enrollmentId: string,
): Promise<{ currentPct: number; completedLessons: number; totalLessons: number }> {
  const { data: modules } = await admin
    .from("program_modules")
    .select("id")
    .eq("program_id", programId);
  const moduleIds = (modules ?? []).map((m) => m.id as string);

  const { count: totalCount } = await admin
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .in("module_id", moduleIds.length ? moduleIds : [NIL_UUID]);

  const { count: completedCount } = await admin
    .from("video_progress")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId)
    .eq("completed", true);

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
  const { data: rpcData, error: rpcError } = await admin.rpc(
    "get_random_quiz_questions" as never,
    { p_program_id: programId, p_limit: limit } as never,
  );

  if (!rpcError && rpcData) {
    return (
      rpcData as Array<{ id: string; question_text: string; options: Record<string, string> }>
    ).map((q) => ({ id: q.id, question_text: q.question_text, options: q.options }));
  }

  const { data: all } = await admin
    .from("quiz_questions")
    .select("id, question_text, options")
    .eq("program_id", programId);

  const pool = [...(all ?? [])];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit).map((q) => ({
    id: q.id as string,
    question_text: q.question_text as string,
    options: q.options as Record<string, string>,
  }));
}

/** Rehidrata texto/opciones de preguntas ya presentadas (reanudar), SIN correct_option. */
export async function getPresentedQuestions(
  admin: AdminClient,
  programId: string,
  questionIds: string[],
): Promise<QuizQuestionPublic[]> {
  if (questionIds.length === 0) return [];
  const { data } = await admin
    .from("quiz_questions")
    .select("id, question_text, options")
    .eq("program_id", programId)
    .in("id", questionIds);

  const byId = new Map((data ?? []).map((q) => [q.id as string, q]));
  return questionIds
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => !!q)
    .map((q) => ({
      id: q.id as string,
      question_text: q.question_text as string,
      options: q.options as Record<string, string>,
    }));
}
