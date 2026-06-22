import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidLike } from "@/lib/utils/zod";
import { resolveEvaluationAccess } from "@/lib/classroom/evaluation-access";
import { getCorrectAnswers, scoreAnswer } from "@/lib/classroom/quiz-runtime";

export const runtime = "nodejs";

const submitSchema = z.object({
  evaluationId: uuidLike,
  attemptId: uuidLike,
  // Respuesta por pregunta: valor único (single/true_false/short) o set (multiple).
  answers: z.record(uuidLike, z.union([z.string(), z.array(z.string())])),
});

/**
 * POST /api/classroom/evaluation/submit
 * Cierra un intento formativo y lo puntúa SERVER-SIDE sobre el set persistido en
 * /start (anti-bypass), usando `scoreAnswer` por tipo. NO emite certificado.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { evaluationId, attemptId, answers } = parsed.data;

  const admin = createAdminClient();
  const access = await resolveEvaluationAccess(supabase, admin, user.id, evaluationId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { evaluation, enrollmentId } = access;

  // (1) Intento válido: de esta matrícula/evaluación e incompleto.
  const { data: attempt } = await admin
    .from("quiz_attempts")
    .select("id, enrollment_id, evaluation_id, questions_presented, completed_at")
    .eq("id", attemptId)
    .single();

  if (
    !attempt ||
    attempt.enrollment_id !== enrollmentId ||
    attempt.evaluation_id !== evaluationId
  ) {
    return NextResponse.json({ error: "Intento no encontrado" }, { status: 404 });
  }
  if (attempt.completed_at) {
    return NextResponse.json({ error: "Este intento ya fue enviado" }, { status: 409 });
  }

  // (2) El set lo fija el intento, no el cliente.
  const presented = (attempt.questions_presented as string[]) ?? [];
  const presentedSet = new Set(presented);
  for (const qid of Object.keys(answers)) {
    if (!presentedSet.has(qid)) {
      return NextResponse.json(
        { error: "Las preguntas no coinciden con tu intento" },
        { status: 409 },
      );
    }
  }

  // (3) Respuestas correctas (server-only) de las presentadas, por evaluación.
  const correct = await getCorrectAnswers(admin, evaluationId, presented);
  if (correct.length !== presented.length) {
    return NextResponse.json({ error: "Error al validar el intento" }, { status: 500 });
  }

  // Puntúa cada presentada con scoreAnswer; las no respondidas → incorrectas.
  let correctCount = 0;
  const review: Record<
    string,
    { correct_answer: unknown; is_correct: boolean }
  > = {};
  for (const q of correct) {
    const isCorrect = scoreAnswer(q, answers[q.id]);
    if (isCorrect) correctCount++;
    review[q.id] = { correct_answer: q.correct_answer, is_correct: isCorrect };
  }

  const totalQuestions = presented.length;
  const scorePct = Math.round((correctCount / totalQuestions) * 100);
  const passed = scorePct >= evaluation.passing_grade_pct;

  // (4) Cierre atómico: solo si seguía incompleto.
  const { data: updatedRows, error: updateError } = await admin
    .from("quiz_attempts")
    .update({
      answers,
      score_pct: scorePct,
      passed,
      completed_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .is("completed_at", null)
    .select("id");

  if (updateError) {
    console.error("Error guardando intento de evaluación:", updateError);
    return NextResponse.json({ error: "Error al guardar el intento" }, { status: 500 });
  }
  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ error: "Este intento ya fue enviado" }, { status: 409 });
  }

  const { count: completedCount } = await admin
    .from("quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId)
    .eq("evaluation_id", evaluationId)
    .not("completed_at", "is", null);

  return NextResponse.json({
    score_pct: scorePct,
    passed,
    correctCount,
    totalQuestions,
    review,
    attemptsRemaining: Math.max(0, evaluation.max_attempts - (completedCount ?? 1)),
  });
}
