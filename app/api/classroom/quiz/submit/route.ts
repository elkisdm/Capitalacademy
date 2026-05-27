import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueCertificate } from "@/lib/certificates/issue-certificate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // --- Auth check ------------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // --- Validate body ---------------------------------------------------------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { programId, answers } = body as {
    programId?: string;
    answers?: Record<string, string>;
  };

  if (!programId) {
    return NextResponse.json(
      { error: "programId es requerido" },
      { status: 422 },
    );
  }

  if (!answers || typeof answers !== "object" || Object.keys(answers).length === 0) {
    return NextResponse.json(
      { error: "answers es requerido y debe contener al menos una respuesta" },
      { status: 422 },
    );
  }

  // Validate answer keys are UUIDs and values are valid options
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validOptions = ["A", "B", "C", "D"];
  for (const [questionId, answer] of Object.entries(answers)) {
    if (!uuidRegex.test(questionId)) {
      return NextResponse.json(
        { error: `ID de pregunta invalido: ${questionId}` },
        { status: 422 },
      );
    }
    if (!validOptions.includes(answer)) {
      return NextResponse.json(
        { error: `Respuesta invalida "${answer}" para pregunta ${questionId}. Opciones validas: A, B, C, D` },
        { status: 422 },
      );
    }
  }

  // --- Fetch enrollment ------------------------------------------------------
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

  // --- Fetch quiz config -----------------------------------------------------
  const { data: config } = await admin
    .from("quiz_configs")
    .select("*")
    .eq("program_id", programId)
    .eq("is_active", true)
    .single();

  if (!config) {
    return NextResponse.json(
      { error: "No hay evaluacion configurada para este programa" },
      { status: 404 },
    );
  }

  // --- Verify student can submit (check attempts) ----------------------------
  const { data: existingAttempts } = await admin
    .from("quiz_attempts")
    .select("id, passed, completed_at, questions_presented")
    .eq("enrollment_id", enrollment.id)
    .eq("program_id", programId)
    .order("created_at", { ascending: false });

  const completedAttempts = (existingAttempts ?? []).filter((a) => a.completed_at);
  const hasPassedBefore = completedAttempts.some((a) => a.passed);

  if (hasPassedBefore) {
    return NextResponse.json(
      { error: "Ya aprobaste esta evaluacion" },
      { status: 409 },
    );
  }

  if (completedAttempts.length >= config.max_attempts) {
    return NextResponse.json(
      { error: "Has alcanzado el numero maximo de intentos" },
      { status: 409 },
    );
  }

  // --- Find or create an incomplete attempt ----------------------------------
  const questionIds = Object.keys(answers);
  const incompleteAttempt = (existingAttempts ?? []).find((a) => !a.completed_at);

  if (incompleteAttempt) {
    // Validate submitted question IDs match the questions_presented in the attempt
    const presented = (incompleteAttempt.questions_presented as string[]) ?? [];
    const presentedSet = new Set(presented);
    const submittedSet = new Set(questionIds);

    if (
      presentedSet.size !== submittedSet.size ||
      ![...submittedSet].every((id) => presentedSet.has(id))
    ) {
      return NextResponse.json(
        { error: "Las preguntas no coinciden con tu intento" },
        { status: 409 },
      );
    }
  }

  // --- Fetch correct answers for submitted question IDs (admin client) -------
  const { data: correctQuestions, error: questionsError } = await admin
    .from("quiz_questions")
    .select("id, correct_option, explanation")
    .in("id", questionIds);

  if (questionsError || !correctQuestions) {
    console.error("Error fetching correct answers:", questionsError);
    return NextResponse.json(
      { error: "Error al obtener las respuestas correctas" },
      { status: 500 },
    );
  }

  if (correctQuestions.length !== questionIds.length) {
    return NextResponse.json(
      { error: "Algunas preguntas enviadas no existen" },
      { status: 422 },
    );
  }

  // --- Score the attempt -----------------------------------------------------
  let correctCount = 0;
  const correctAnswers: Record<
    string,
    { correct_option: string; explanation: string | null; is_correct: boolean }
  > = {};

  for (const q of correctQuestions) {
    const studentAnswer = answers[q.id];
    const isCorrect = studentAnswer === q.correct_option;

    if (isCorrect) {
      correctCount++;
    }

    correctAnswers[q.id] = {
      correct_option: q.correct_option,
      explanation: q.explanation,
      is_correct: isCorrect,
    };
  }

  const totalQuestions = correctQuestions.length;
  const scorePct = Math.round((correctCount / totalQuestions) * 100);
  const passed = scorePct >= config.passing_grade_pct;

  // --- Update existing incomplete attempt or insert new one ------------------
  let attemptId: string;

  if (incompleteAttempt) {
    const { error: updateError } = await admin
      .from("quiz_attempts")
      .update({
        answers,
        score_pct: scorePct,
        passed,
        completed_at: new Date().toISOString(),
      })
      .eq("id", incompleteAttempt.id);

    if (updateError) {
      console.error("Error updating quiz attempt:", updateError);
      return NextResponse.json(
        { error: "Error al guardar el intento" },
        { status: 500 },
      );
    }

    attemptId = incompleteAttempt.id;
  } else {
    const { data: newAttempt, error: insertError } = await admin
      .from("quiz_attempts")
      .insert({
        enrollment_id: enrollment.id,
        program_id: programId,
        questions_presented: questionIds,
        answers,
        score_pct: scorePct,
        passed,
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !newAttempt) {
      console.error("Error inserting quiz attempt:", insertError);
      return NextResponse.json(
        { error: "Error al guardar el intento" },
        { status: 500 },
      );
    }

    attemptId = newAttempt.id;
  }

  // --- Trigger certificate generation if passed ------------------------------
  let certificateResult: { verificationCode: string; pdfUrl: string } | null = null;
  let certificateError: string | null = null;

  if (passed) {
    try {
      const cert = await issueCertificate(enrollment.id, attemptId);
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
    attemptId,
    attemptsRemaining: config.max_attempts - (completedAttempts.length + 1),
    certificate: certificateResult,
    certificateError,
  });
}
