import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // --- Auth check ------------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");

  if (!programId) {
    return NextResponse.json(
      { error: "programId es requerido" },
      { status: 422 },
    );
  }

  // --- Fetch enrollment via cohorts ------------------------------------------
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

  // --- Fetch quiz config -----------------------------------------------------
  const admin = createAdminClient();

  const { data: config, error: configError } = await admin
    .from("quiz_configs")
    .select("*")
    .eq("program_id", programId)
    .eq("is_active", true)
    .single();

  if (configError || !config) {
    return NextResponse.json(
      { error: "No hay evaluacion configurada para este programa" },
      { status: 404 },
    );
  }

  // --- Check lesson completion -----------------------------------------------
  // Total lessons in program
  const { count: totalLessons } = await admin
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .in(
      "module_id",
      (
        await admin
          .from("program_modules")
          .select("id")
          .eq("program_id", programId)
      ).data?.map((m) => m.id) ?? [],
    );

  // Completed lessons for this enrollment
  const { count: completedLessons } = await admin
    .from("video_progress")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollment.id)
    .eq("completed", true);

  const total = totalLessons ?? 0;
  const completed = completedLessons ?? 0;
  const currentPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (currentPct < config.min_completion_pct) {
    return NextResponse.json({
      locked: true,
      reason: "completion",
      currentPct,
      requiredPct: config.min_completion_pct,
      completedLessons: completed,
      totalLessons: total,
    });
  }

  // --- Check attempts --------------------------------------------------------
  const { data: attempts } = await admin
    .from("quiz_attempts")
    .select("id, passed, completed_at")
    .eq("enrollment_id", enrollment.id)
    .eq("program_id", programId)
    .order("created_at", { ascending: false });

  const completedAttempts = (attempts ?? []).filter((a) => a.completed_at);
  const hasPassedBefore = completedAttempts.some((a) => a.passed);
  const attemptsUsed = completedAttempts.length;

  if (attemptsUsed >= config.max_attempts && !hasPassedBefore) {
    return NextResponse.json({
      locked: true,
      reason: "max_attempts",
      attemptsUsed,
      maxAttempts: config.max_attempts,
    });
  }

  // --- Fetch random questions (admin client bypasses RLS) --------------------
  // Use order with a random seed to get random questions
  const { data: questions, error: questionsError } = await admin
    .rpc("get_random_quiz_questions" as never, {
      p_program_id: programId,
      p_limit: config.questions_per_attempt,
    } as never);

  // Fallback: if RPC doesn't exist, fetch all and randomize in JS
  let selectedQuestions: Array<{
    id: string;
    question_text: string;
    options: Record<string, string>;
  }>;

  if (questionsError || !questions) {
    const { data: allQuestions } = await admin
      .from("quiz_questions")
      .select("id, question_text, options")
      .eq("program_id", programId);

    if (!allQuestions || allQuestions.length === 0) {
      return NextResponse.json(
        { error: "No hay preguntas disponibles para este programa" },
        { status: 404 },
      );
    }

    // Fisher-Yates shuffle and take N
    const shuffled = [...allQuestions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    selectedQuestions = shuffled.slice(0, config.questions_per_attempt);
  } else {
    selectedQuestions = (
      questions as Array<{
        id: string;
        question_text: string;
        options: Record<string, string>;
        correct_option: string;
        explanation: string | null;
      }>
    ).map((q) => ({
      id: q.id,
      question_text: q.question_text,
      options: q.options,
    }));
  }

  // --- Return questions WITHOUT correct_option and explanation ----------------
  return NextResponse.json({
    quiz: {
      config: {
        time_limit_minutes: config.time_limit_minutes,
        questions_per_attempt: config.questions_per_attempt,
        passing_grade_pct: config.passing_grade_pct,
      },
      questions: selectedQuestions.map((q) => ({
        id: q.id,
        question_text: q.question_text,
        options: q.options,
      })),
      attemptsUsed,
      attemptsRemaining: config.max_attempts - attemptsUsed,
    },
  });
}
