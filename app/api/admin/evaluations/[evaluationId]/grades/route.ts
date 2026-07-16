import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEvaluationStaff } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ evaluationId: string }> };
type CriterionMark = { criterion_id: string; label: string; checked: boolean };

// ---------------------------------------------------------------------------
// GET  /api/admin/evaluations/[evaluationId]/grades?cohortId=xxx
//   Roster de notas de UNA cohorte para esta evaluación (incluye alumnos SIN
//   nota, grade null). El selector de cohorte es OBLIGATORIO: la evaluación es
//   program-scoped, pero la nota es por alumno Y por cohorte.
// ---------------------------------------------------------------------------

export async function GET(req: Request, { params }: Ctx) {
  const { evaluationId } = await params;
  const { searchParams } = new URL(req.url);
  const cohortId = searchParams.get("cohortId");

  if (!cohortId) {
    return NextResponse.json({ error: "cohortId es requerido" }, { status: 422 });
  }

  const auth = await requireEvaluationStaff(evaluationId, cohortId);
  if ("error" in auth) return auth.error;

  const admin = createAdminClient();

  const { data: evaluation, error: evalError } = await admin
    .from("evaluations")
    .select("*")
    .eq("id", evaluationId)
    .single();
  if (evalError || !evaluation) {
    return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
  }

  const { data: criteria } = await admin
    .from("evaluation_criteria")
    .select("*")
    .eq("evaluation_id", evaluationId)
    .order("position", { ascending: true });

  // RN vigente en el resto del repo (resolveEvaluationAccess, etc.): active +
  // completed ven/tienen contenido; nunca invited/suspended.
  const { data: enrollments } = await admin
    .from("enrollments")
    .select("id, student_id, profiles(full_name, email)")
    .eq("cohort_id", cohortId)
    .in("status", ["active", "completed"]);

  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  const { data: grades } =
    enrollmentIds.length > 0
      ? await admin
          .from("evaluation_grades")
          .select("*")
          .eq("evaluation_id", evaluationId)
          .in("enrollment_id", enrollmentIds)
      : { data: [] as Database["public"]["Tables"]["evaluation_grades"]["Row"][] };

  const gradeByEnrollment = new Map((grades ?? []).map((g) => [g.enrollment_id, g]));

  const roster = (enrollments ?? [])
    .map((e) => {
      const profile = e.profiles as { full_name: string | null; email: string } | null;
      const g = gradeByEnrollment.get(e.id);
      return {
        enrollmentId: e.id,
        studentName: profile?.full_name ?? profile?.email ?? "—",
        email: profile?.email ?? null,
        grade: g?.grade ?? null,
        scorePct: g?.score_pct ?? null,
        source: g?.source ?? null,
        feedback: g?.feedback ?? null,
        criteriaMarks: (g?.criteria_marks as CriterionMark[] | undefined) ?? [],
        publishedAt: g?.published_at ?? null,
        gradedAt: g?.graded_at ?? null,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName, "es"));

  return NextResponse.json({ evaluation, criteria: criteria ?? [], roster });
}

// ---------------------------------------------------------------------------
// PUT  /api/admin/evaluations/[evaluationId]/grades
//   Upsert de la nota de UN alumno (borrador o publicar).
// ---------------------------------------------------------------------------

const criterionMarkSchema = z.object({
  criterion_id: uuidLike,
  label: z.string().trim().min(1).max(200),
  checked: z.boolean(),
});

const putSchema = z.object({
  enrollmentId: uuidLike,
  grade: z.number().min(1).max(7).nullable(),
  feedback: z.string().trim().max(4000).nullable().optional(),
  criteriaMarks: z.array(criterionMarkSchema).optional(),
  publish: z.boolean(),
});

export async function PUT(req: Request, { params }: Ctx) {
  const { evaluationId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const v = parsed.data;
  const admin = createAdminClient();

  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id, cohort_id")
    .eq("id", v.enrollmentId)
    .maybeSingle();
  if (!enrollment) {
    return NextResponse.json({ error: "Matrícula no encontrada" }, { status: 404 });
  }

  const auth = await requireEvaluationStaff(evaluationId, enrollment.cohort_id);
  if ("error" in auth) return auth.error;

  const { data: upserted, error } = await admin
    .from("evaluation_grades")
    .upsert(
      {
        evaluation_id: evaluationId,
        enrollment_id: v.enrollmentId,
        grade: v.grade,
        source: "manual",
        feedback: v.feedback ?? null,
        criteria_marks: v.criteriaMarks ?? [],
        graded_by: auth.user.id,
        graded_at: new Date().toISOString(),
        published_at: v.publish ? new Date().toISOString() : null,
      },
      { onConflict: "evaluation_id,enrollment_id" },
    )
    .select()
    .single();

  if (error) {
    console.error("Error guardando nota:", error);
    return NextResponse.json({ error: "Error al guardar la nota" }, { status: 500 });
  }

  return NextResponse.json({ grade: upserted });
}

// ---------------------------------------------------------------------------
// POST  /api/admin/evaluations/[evaluationId]/grades?action=publish
//   Publica TODAS las notas ya cargadas (con grade) y aún no publicadas de
//   la cohorte indicada.
// ---------------------------------------------------------------------------

const publishSchema = z.object({ cohortId: uuidLike });

export async function POST(req: Request, { params }: Ctx) {
  const { evaluationId } = await params;
  const { searchParams } = new URL(req.url);
  if (searchParams.get("action") !== "publish") {
    return NextResponse.json({ error: "Acción no soportada" }, { status: 422 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { cohortId } = parsed.data;

  const auth = await requireEvaluationStaff(evaluationId, cohortId);
  if ("error" in auth) return auth.error;

  const admin = createAdminClient();

  const { data: enrollments } = await admin
    .from("enrollments")
    .select("id")
    .eq("cohort_id", cohortId);
  const enrollmentIds = (enrollments ?? []).map((e) => e.id);
  if (enrollmentIds.length === 0) {
    return NextResponse.json({ published: 0 });
  }

  const { data: updated, error } = await admin
    .from("evaluation_grades")
    .update({ published_at: new Date().toISOString() })
    .eq("evaluation_id", evaluationId)
    .in("enrollment_id", enrollmentIds)
    .not("grade", "is", null)
    .is("published_at", null)
    .select("id");

  if (error) {
    console.error("Error publicando notas:", error);
    return NextResponse.json({ error: "Error al publicar las notas" }, { status: 500 });
  }

  return NextResponse.json({ published: updated?.length ?? 0 });
}
