import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidLike } from "@/lib/utils/zod";
import {
  getCompletion,
  selectEvaluationQuestions,
  getPresentedEvaluationQuestions,
} from "@/lib/classroom/quiz-runtime";
import { isEvaluationOpen } from "@/lib/classroom/evaluation-window";

export const runtime = "nodejs";

const startSchema = z.object({ programId: uuidLike });

/**
 * Inicia (o reanuda) un intento de quiz. PERSISTE el set de preguntas que el
 * servidor elige (`questions_presented`), de modo que el submit puede validar
 * contra él. Sin este intento persistido, el submit rechaza: es lo que cierra
 * el bypass de certificación (el cliente ya no decide qué/cuántas preguntas).
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
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { programId } = parsed.data;

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
  const { data: config } = await admin
    .from("evaluations")
    .select("*")
    .eq("program_id", programId)
    .eq("scope", "final")
    .eq("is_active", true)
    .single();
  // Ventana de programación (0070) estricta (D5: "estricto" en start, a
  // diferencia de submit — ver route.ts de submit).
  if (!config || !isEvaluationOpen(config)) {
    return NextResponse.json(
      { error: "No hay evaluacion configurada para este programa" },
      { status: 404 },
    );
  }
  const questionsPerAttempt = config.questions_per_attempt ?? 10;
  const minCompletion = config.min_completion_pct ?? 0;

  // Intentos del FINAL: anclados a la evaluación final (config.id), NO a program_id
  // —los intentos formativos por clase comparten program_id y contaminarían el gate.
  const { data: attempts } = await admin
    .from("quiz_attempts")
    .select("id, passed, completed_at, questions_presented, started_at")
    .eq("enrollment_id", enrollment.id)
    .eq("evaluation_id", config.id)
    .order("created_at", { ascending: false });

  const all = attempts ?? [];
  const completed = all.filter((a) => a.completed_at);

  if (completed.some((a) => a.passed)) {
    return NextResponse.json({ error: "Ya aprobaste esta evaluacion" }, { status: 409 });
  }

  const configPublic = {
    questionsPerAttempt,
    passingGradePct: config.passing_grade_pct,
    maxAttempts: config.max_attempts,
    timeLimitMinutes: config.time_limit_minutes,
  };

  // Reanudar un intento incompleto vigente (el set ya quedó fijado).
  const incomplete = all.find((a) => !a.completed_at);
  if (incomplete) {
    const presentedIds = (incomplete.questions_presented as string[]) ?? [];
    const questions = await getPresentedEvaluationQuestions(admin, config.id, presentedIds);
    return NextResponse.json({
      attemptId: incomplete.id,
      questions,
      startedAt: incomplete.started_at,
      attempt: completed.length + 1,
      config: configPublic,
    });
  }

  // Intento nuevo: tope de intentos.
  if (completed.length >= config.max_attempts) {
    return NextResponse.json(
      { error: "Has alcanzado el numero maximo de intentos" },
      { status: 409 },
    );
  }

  // Gate de completitud server-side (no confiar en el cliente).
  const { currentPct } = await getCompletion(admin, programId, enrollment.id);
  if (currentPct < minCompletion) {
    return NextResponse.json(
      {
        error: "Aun no completaste el contenido requerido para rendir",
        currentPct,
        requiredPct: minCompletion,
      },
      { status: 403 },
    );
  }

  // Selección server-side + persistencia del set presentado (pool de la evaluación final).
  const selected = await selectEvaluationQuestions(admin, config.id, questionsPerAttempt);
  if (selected.length === 0) {
    return NextResponse.json(
      { error: "No hay preguntas disponibles para este programa" },
      { status: 404 },
    );
  }

  const { data: created, error: insertError } = await admin
    .from("quiz_attempts")
    .insert({
      enrollment_id: enrollment.id,
      program_id: programId,
      evaluation_id: config.id,
      questions_presented: selected.map((q) => q.id),
      answers: {},
    })
    .select("id, started_at")
    .single();
  if (insertError || !created) {
    console.error("Error creando intento de quiz:", insertError);
    return NextResponse.json({ error: "Error al iniciar el intento" }, { status: 500 });
  }

  return NextResponse.json({
    attemptId: created.id,
    questions: selected,
    startedAt: created.started_at,
    attempt: completed.length + 1,
    config: configPublic,
  });
}
