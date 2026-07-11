import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ evaluationId: string }> };

// ---------------------------------------------------------------------------
// GET  /api/admin/evaluations/[evaluationId]
//   Detalle de una evaluación + sus preguntas (con respuestas, vista admin).
// ---------------------------------------------------------------------------

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { evaluationId } = await params;
  const admin = createAdminClient();

  const { data: evaluation, error } = await admin
    .from("evaluations")
    .select("*")
    .eq("id", evaluationId)
    .single();
  if (error || !evaluation) {
    return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
  }

  const { data: questions } = await admin
    .from("quiz_questions")
    .select("*")
    .eq("evaluation_id", evaluationId)
    .order("sort_order", { ascending: true });

  return NextResponse.json({ evaluation, questions: questions ?? [] });
}

// ---------------------------------------------------------------------------
// PATCH  /api/admin/evaluations/[evaluationId]
//   Edita config/título/estado. NO permite cambiar scope ni target (se borra y
//   recrea si hace falta — evita estados incoherentes).
// ---------------------------------------------------------------------------

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    passingGradePct: z.number().int().min(1).max(100).optional(),
    questionsPerAttempt: z.number().int().min(1).max(200).nullable().optional(),
    maxAttempts: z.number().int().min(1).max(50).optional(),
    timeLimitMinutes: z.number().int().min(1).max(600).nullable().optional(),
    minCompletionPct: z.number().int().min(1).max(100).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No se enviaron campos" });

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { evaluationId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const v = parsed.data;

  const updates: Database["public"]["Tables"]["evaluations"]["Update"] = {};
  if (v.title !== undefined) updates.title = v.title;
  if (v.description !== undefined) updates.description = v.description;
  if (v.passingGradePct !== undefined) updates.passing_grade_pct = v.passingGradePct;
  if (v.questionsPerAttempt !== undefined) updates.questions_per_attempt = v.questionsPerAttempt;
  if (v.maxAttempts !== undefined) updates.max_attempts = v.maxAttempts;
  if (v.timeLimitMinutes !== undefined) updates.time_limit_minutes = v.timeLimitMinutes;
  if (v.minCompletionPct !== undefined) updates.min_completion_pct = v.minCompletionPct;
  if (v.isActive !== undefined) updates.is_active = v.isActive;

  const admin = createAdminClient();

  // Invariante "activa ⇒ respondible": no activar una evaluación sin preguntas
  // (la validación cliente no basta; un PATCH directo la evadiría).
  if (v.isActive === true) {
    const { count } = await admin
      .from("quiz_questions")
      .select("id", { count: "exact", head: true })
      .eq("evaluation_id", evaluationId);
    if ((count ?? 0) === 0) {
      return NextResponse.json(
        { error: "No se puede activar una evaluación sin preguntas" },
        { status: 422 },
      );
    }
  }

  const { data: updated, error } = await admin
    .from("evaluations")
    .update(updates)
    .eq("id", evaluationId)
    .select()
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "Ya hay otra evaluación activa para esta lección o módulo" },
        { status: 409 },
      );
    }
    console.error("Error updating evaluation:", error);
    return NextResponse.json({ error: "Error al actualizar la evaluación" }, { status: 500 });
  }

  return NextResponse.json({ evaluation: updated });
}

// ---------------------------------------------------------------------------
// DELETE  /api/admin/evaluations/[evaluationId]
//   Bloquea el borrado si ya hay intentos (preserva el historial académico).
// ---------------------------------------------------------------------------

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { evaluationId } = await params;
  const admin = createAdminClient();

  const { count: attemptCount } = await admin
    .from("quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("evaluation_id", evaluationId);

  if ((attemptCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "No se puede eliminar: ya tiene intentos de alumnos. Desactívala en su lugar." },
      { status: 409 },
    );
  }

  // Las preguntas caen por ON DELETE CASCADE de evaluation_id.
  const { error } = await admin.from("evaluations").delete().eq("id", evaluationId);
  if (error) {
    console.error("Error deleting evaluation:", error);
    return NextResponse.json({ error: "Error al eliminar la evaluación" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
