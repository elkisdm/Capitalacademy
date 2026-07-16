import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEvaluationStaff } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ evaluationId: string }> };

// ---------------------------------------------------------------------------
// GET  /api/admin/evaluations/[evaluationId]/criteria
//   Lista el checklist parametrizable de la evaluación, ordenado.
// ---------------------------------------------------------------------------

export async function GET(_req: Request, { params }: Ctx) {
  const { evaluationId } = await params;
  const auth = await requireEvaluationStaff(evaluationId);
  if ("error" in auth) return auth.error;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("evaluation_criteria")
    .select("*")
    .eq("evaluation_id", evaluationId)
    .order("position", { ascending: true });

  if (error) {
    console.error("Error fetching evaluation criteria:", error);
    return NextResponse.json({ error: "Error al obtener el checklist" }, { status: 500 });
  }

  return NextResponse.json({ criteria: data ?? [] });
}

// ---------------------------------------------------------------------------
// POST  /api/admin/evaluations/[evaluationId]/criteria
//   Agrega un criterio al final del checklist.
// ---------------------------------------------------------------------------

const createSchema = z.object({
  label: z.string().trim().min(1, "El criterio no puede estar vacío").max(200),
});

export async function POST(req: Request, { params }: Ctx) {
  const { evaluationId } = await params;
  const auth = await requireEvaluationStaff(evaluationId);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const admin = createAdminClient();
  const { count } = await admin
    .from("evaluation_criteria")
    .select("id", { count: "exact", head: true })
    .eq("evaluation_id", evaluationId);

  const { data: created, error } = await admin
    .from("evaluation_criteria")
    .insert({
      evaluation_id: evaluationId,
      label: parsed.data.label,
      position: count ?? 0,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating evaluation criterion:", error);
    return NextResponse.json({ error: "Error al crear el criterio" }, { status: 500 });
  }

  return NextResponse.json({ criterion: created }, { status: 201 });
}

// ---------------------------------------------------------------------------
// PATCH  /api/admin/evaluations/[evaluationId]/criteria
//   Edita el label de un criterio existente. NO reescribe el historial: las
//   notas ya calificadas guardan un snapshot (`evaluation_grades.criteria_marks`).
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  criterionId: uuidLike,
  label: z.string().trim().min(1, "El criterio no puede estar vacío").max(200),
});

export async function PATCH(req: Request, { params }: Ctx) {
  const { evaluationId } = await params;
  const auth = await requireEvaluationStaff(evaluationId);
  if ("error" in auth) return auth.error;

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

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("evaluation_criteria")
    .update({ label: parsed.data.label })
    .eq("id", parsed.data.criterionId)
    .eq("evaluation_id", evaluationId)
    .select()
    .single();

  if (error) {
    console.error("Error updating evaluation criterion:", error);
    return NextResponse.json({ error: "Error al actualizar el criterio" }, { status: 500 });
  }

  return NextResponse.json({ criterion: updated });
}

// ---------------------------------------------------------------------------
// DELETE  /api/admin/evaluations/[evaluationId]/criteria?criterionId=xxx
// ---------------------------------------------------------------------------

export async function DELETE(req: Request, { params }: Ctx) {
  const { evaluationId } = await params;
  const auth = await requireEvaluationStaff(evaluationId);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const criterionId = searchParams.get("criterionId");
  if (!criterionId) {
    return NextResponse.json({ error: "criterionId es requerido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("evaluation_criteria")
    .delete()
    .eq("id", criterionId)
    .eq("evaluation_id", evaluationId);

  if (error) {
    console.error("Error deleting evaluation criterion:", error);
    return NextResponse.json({ error: "Error al eliminar el criterio" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
