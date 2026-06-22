import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveEvaluationAccess, toPublicConfig } from "@/lib/classroom/evaluation-access";

export const runtime = "nodejs";

/**
 * GET /api/classroom/evaluation?evaluationId=xxx
 * Estado de una evaluación formativa para el alumno (NO entrega preguntas):
 * intentos usados/restantes, mejor nota, si hay un intento en curso.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const evaluationId = searchParams.get("evaluationId");
  if (!evaluationId) {
    return NextResponse.json({ error: "evaluationId es requerido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const access = await resolveEvaluationAccess(supabase, admin, user.id, evaluationId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { evaluation, enrollmentId } = access;

  const { data: attempts } = await admin
    .from("quiz_attempts")
    .select("id, passed, score_pct, completed_at")
    .eq("enrollment_id", enrollmentId)
    .eq("evaluation_id", evaluationId)
    .order("created_at", { ascending: false });

  const all = attempts ?? [];
  const completed = all.filter((a) => a.completed_at);
  const hasInProgress = all.some((a) => !a.completed_at);
  const scores = completed.map((a) => a.score_pct ?? 0);
  const bestScore = scores.length ? Math.max(...scores) : null;
  const attemptsRemaining = Math.max(0, evaluation.max_attempts - completed.length);

  return NextResponse.json({
    title: evaluation.title,
    scope: evaluation.scope,
    config: toPublicConfig(evaluation),
    attemptsUsed: completed.length,
    attemptsRemaining,
    hasInProgress,
    bestScore,
    passed: completed.some((a) => a.passed),
  });
}
