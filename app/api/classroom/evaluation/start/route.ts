import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidLike } from "@/lib/utils/zod";
import { resolveEvaluationAccess, toPublicConfig } from "@/lib/classroom/evaluation-access";
import {
  selectEvaluationQuestions,
  getPresentedEvaluationQuestions,
} from "@/lib/classroom/quiz-runtime";

export const runtime = "nodejs";

const startSchema = z.object({ evaluationId: uuidLike });

/**
 * POST /api/classroom/evaluation/start
 * Inicia (o reanuda) un intento FORMATIVO de una evaluación por clase. Persiste
 * el set de preguntas server-side (mismo blindaje anti-bypass que el final),
 * pero SIN gate de completitud y SIN certificado.
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

  const admin = createAdminClient();
  const access = await resolveEvaluationAccess(supabase, admin, user.id, parsed.data.evaluationId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { evaluation, enrollmentId } = access;

  const { data: attempts } = await admin
    .from("quiz_attempts")
    .select("id, completed_at, questions_presented, started_at")
    .eq("enrollment_id", enrollmentId)
    .eq("evaluation_id", evaluation.id)
    .order("created_at", { ascending: false });

  const all = attempts ?? [];
  const completed = all.filter((a) => a.completed_at);
  const configPublic = toPublicConfig(evaluation);

  // Reanudar un intento incompleto (el set ya quedó fijado).
  const incomplete = all.find((a) => !a.completed_at);
  if (incomplete) {
    const presentedIds = (incomplete.questions_presented as string[]) ?? [];
    const questions = await getPresentedEvaluationQuestions(admin, evaluation.id, presentedIds);
    return NextResponse.json({
      attemptId: incomplete.id,
      questions,
      startedAt: incomplete.started_at,
      attempt: completed.length + 1,
      config: configPublic,
    });
  }

  // Tope de intentos.
  if (completed.length >= evaluation.max_attempts) {
    return NextResponse.json(
      { error: "Has alcanzado el número máximo de intentos" },
      { status: 409 },
    );
  }

  // Selección server-side + persistencia del set (questions_per_attempt null = todas).
  const selected = await selectEvaluationQuestions(
    admin,
    evaluation.id,
    evaluation.questions_per_attempt,
  );
  if (selected.length === 0) {
    return NextResponse.json(
      { error: "Esta evaluación aún no tiene preguntas" },
      { status: 404 },
    );
  }

  const { data: created, error: insertError } = await admin
    .from("quiz_attempts")
    .insert({
      enrollment_id: enrollmentId,
      program_id: evaluation.program_id,
      evaluation_id: evaluation.id,
      questions_presented: selected.map((q) => q.id),
      answers: {},
    })
    .select("id, started_at")
    .single();
  if (insertError || !created) {
    console.error("Error creando intento de evaluación:", insertError);
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
