import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueCertificate } from "@/lib/certificates/issue-certificate";
import { uuidLike } from "@/lib/utils/zod";
import { syncQuizGrade } from "@/lib/grades/sync-quiz-grade";
import { scoreAnswer, type QuestionType, type ScorableQuestion } from "@/lib/classroom/quiz-runtime";

export const runtime = "nodejs";

const submitSchema = z.object({
  programId: uuidLike,
  attemptId: uuidLike,
  // Valor único (single_choice/true_false/short_answer) o set (multiple_choice).
  answers: z.record(uuidLike, z.union([z.string(), z.array(z.string())])),
});

/**
 * Cierra un intento de quiz iniciado en /start y, si aprueba, emite el certificado.
 *
 * Seguridad (cierra el bypass de certificación de la Megaauditoría v2):
 *   1. Requiere un intento PERSISTIDO (de /start), de esta matrícula/programa e
 *      incompleto. Sin él → 404: no se puede puntuar sin haber iniciado.
 *   2. El set y el TOTAL de preguntas salen de `questions_presented` del intento,
 *      NO de lo que envía el cliente. El denominador lo fija el servidor.
 *   3. Las preguntas se acotan por `program_id` (no se mezclan tenants).
 *   4. El cierre es atómico (`completed_at IS NULL`), anti doble-submit.
 *   El gate de completitud se aplica en /start (la existencia del intento lo prueba).
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
  const { programId, attemptId, answers } = parsed.data;

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
  // D5 (ver ADR-0016): a propósito NO se aplica `closes_at` aquí — un intento ya
  // iniciado (pasó el gate estricto de /start) siempre se puede entregar, aunque
  // la ventana haya cerrado mientras el alumno respondía. Solo se exige
  // `is_active` (que sigue siendo el master switch de publicación).
  const { data: config } = await admin
    .from("evaluations")
    .select("*")
    .eq("program_id", programId)
    .eq("scope", "final")
    .eq("is_active", true)
    .single();
  if (!config) {
    return NextResponse.json(
      { error: "No hay evaluacion configurada para este programa" },
      { status: 404 },
    );
  }

  // (1) El intento debe existir, ser de esta matrícula y de la EVALUACIÓN FINAL
  // (no de un quiz formativo que comparte program_id), y estar incompleto.
  const { data: attempt } = await admin
    .from("quiz_attempts")
    .select("id, enrollment_id, program_id, evaluation_id, questions_presented, completed_at")
    .eq("id", attemptId)
    .single();

  if (
    !attempt ||
    attempt.enrollment_id !== enrollment.id ||
    attempt.program_id !== programId ||
    attempt.evaluation_id !== config.id
  ) {
    return NextResponse.json({ error: "Intento no encontrado" }, { status: 404 });
  }
  if (attempt.completed_at) {
    return NextResponse.json({ error: "Este intento ya fue enviado" }, { status: 409 });
  }

  // Guarda de "ya aprobó" — acotada a la evaluación final, no al programa.
  const { data: priorPassed } = await admin
    .from("quiz_attempts")
    .select("id")
    .eq("enrollment_id", enrollment.id)
    .eq("evaluation_id", config.id)
    .eq("passed", true)
    .maybeSingle();
  if (priorPassed) {
    return NextResponse.json({ error: "Ya aprobaste esta evaluacion" }, { status: 409 });
  }

  // (2) El set de preguntas lo fija el intento, no el cliente.
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

  // (3) Respuestas correctas solo de las presentadas, acotadas a la evaluación final.
  const { data: correctQuestions, error: questionsError } = await admin
    .from("quiz_questions")
    .select("id, question_type, correct_answer, correct_option, explanation")
    .eq("evaluation_id", config.id)
    .in("id", presented);

  if (
    questionsError ||
    !correctQuestions ||
    correctQuestions.length !== presented.length
  ) {
    console.error("Error obteniendo respuestas correctas:", questionsError);
    return NextResponse.json({ error: "Error al validar el intento" }, { status: 500 });
  }

  // Score sobre el set PRESENTADO; las no respondidas cuentan como incorrectas.
  // Puntúa por tipo con `scoreAnswer` (compartido con evaluation/submit): el panel
  // admin genérico permite crear preguntas multiple_choice/true_false/short_answer
  // también en evaluaciones scope='final', no solo single_choice.
  let correctCount = 0;
  const correctAnswers: Record<
    string,
    { correct_option: string; explanation: string | null; is_correct: boolean }
  > = {};
  for (const q of correctQuestions) {
    // Compat: si correct_answer aún no está poblado, cae a correct_option (legacy).
    const correctAnswerValue = q.correct_answer ?? q.correct_option;
    const scorable: ScorableQuestion = {
      id: q.id,
      question_type: (q.question_type as QuestionType) ?? "single_choice",
      correct_answer: correctAnswerValue,
    };
    const isCorrect = scoreAnswer(scorable, answers[q.id]);
    if (isCorrect) correctCount++;
    correctAnswers[q.id] = {
      correct_option: Array.isArray(correctAnswerValue)
        ? correctAnswerValue.join(", ")
        : String(correctAnswerValue ?? ""),
      explanation: q.explanation,
      is_correct: isCorrect,
    };
  }

  const totalQuestions = presented.length;
  const scorePct = Math.round((correctCount / totalQuestions) * 100);
  const passed = scorePct >= config.passing_grade_pct;

  // (4) Cierre atómico: solo si el intento sigue incompleto.
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
    console.error("Error guardando intento de quiz:", updateError);
    return NextResponse.json({ error: "Error al guardar el intento" }, { status: 500 });
  }
  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ error: "Este intento ya fue enviado" }, { status: 409 });
  }

  // Registro académico (Paso 5 del brief evaluaciones/notas 1-7): best-effort,
  // nunca bloquea la emisión del certificado ni la respuesta al alumno.
  await syncQuizGrade(admin, {
    evaluationId: config.id,
    programId,
    enrollmentId: enrollment.id,
  });

  const { data: completedAfter } = await admin
    .from("quiz_attempts")
    .select("id")
    .eq("enrollment_id", enrollment.id)
    .eq("evaluation_id", config.id)
    .not("completed_at", "is", null);
  const attemptsCompleted = completedAfter?.length ?? 1;

  let certificateResult: { verificationCode: string; pdfUrl: string } | null = null;
  let certificateError: string | null = null;

  if (passed) {
    try {
      const cert = await issueCertificate(enrollment.id, attempt.id);
      certificateResult = {
        verificationCode: cert.verificationCode,
        pdfUrl: cert.pdfUrl,
      };
    } catch (err) {
      certificateError = err instanceof Error ? err.message : "Error generando certificado";
      console.error("Certificate generation failed:", err);
    }
  }

  return NextResponse.json({
    score_pct: scorePct,
    passed,
    correctCount,
    totalQuestions,
    correctAnswers,
    attemptId: attempt.id,
    attemptsRemaining: Math.max(0, config.max_attempts - attemptsCompleted),
    certificate: certificateResult,
    certificateError,
  });
}
