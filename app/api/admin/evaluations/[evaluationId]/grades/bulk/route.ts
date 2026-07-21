import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEvaluationStaff } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { pctToGrade, DEFAULT_EXIGENCIA_PCT } from "@/lib/grades/scale";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ evaluationId: string }> };

// ---------------------------------------------------------------------------
// POST  /api/admin/evaluations/[evaluationId]/grades/bulk
//   Import de notas desde Excel/CSV (Paso 8 del brief). El match es por EMAIL,
//   NUNCA por RUT (ADR-0015 eliminó la unicidad global del RUT), y se resuelve
//   DENTRO de la cohorte indicada — nunca global (R6, fuga cross-tenant).
//   Borrador por defecto (`publish` default false, H2 de la auditoría): publicar
//   de más es irreversible en la práctica (el alumno ya vio la nota
//   equivocada), publicar de menos cuesta un clic ("Publicar todas"). Al
//   importar como borrador se PRESERVA el `published_at` existente — nunca
//   despublica en masa una reimportación (H3).
// ---------------------------------------------------------------------------

const rowSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    grade: z.number().min(1).max(7).optional(),
    scorePct: z.number().min(0).max(100).optional(),
    comentario: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.grade !== undefined || v.scorePct !== undefined, {
    message: "Cada fila necesita nota o porcentaje",
  });

const bodySchema = z.object({
  cohortId: uuidLike,
  rows: z.array(rowSchema).min(1).max(500),
  publish: z.boolean().optional().default(false),
});

export async function POST(req: Request, { params }: Ctx) {
  const { evaluationId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const { cohortId, rows, publish } = parsed.data;

  const auth = await requireEvaluationStaff(evaluationId, cohortId);
  if ("error" in auth) return auth.error;

  const admin = createAdminClient();

  const { data: evaluation } = await admin
    .from("evaluations")
    .select("id, program_id")
    .eq("id", evaluationId)
    .single();
  if (!evaluation) {
    return NextResponse.json({ error: "Evaluación no encontrada" }, { status: 404 });
  }

  const { data: program } = await admin
    .from("programs")
    .select("grade_exigencia_pct")
    .eq("id", evaluation.program_id)
    .single();
  const exigencia = program?.grade_exigencia_pct ?? DEFAULT_EXIGENCIA_PCT;

  // Resuelve email → enrollment DENTRO de esta cohorte (nunca global).
  const { data: enrollments } = await admin
    .from("enrollments")
    .select("id, profiles(email)")
    .eq("cohort_id", cohortId)
    .in("status", ["active", "completed"]);

  const enrollmentByEmail = new Map<string, string>();
  for (const e of enrollments ?? []) {
    const email = (e.profiles as { email: string } | null)?.email?.toLowerCase();
    if (email) enrollmentByEmail.set(email, e.id);
  }

  const enrollmentIds = Array.from(enrollmentByEmail.values());
  const { data: existingGrades } =
    enrollmentIds.length > 0
      ? await admin
          .from("evaluation_grades")
          .select("enrollment_id, published_at")
          .eq("evaluation_id", evaluationId)
          .in("enrollment_id", enrollmentIds)
      : { data: [] as Array<{ enrollment_id: string; published_at: string | null }> };
  const existingByEnrollment = new Map((existingGrades ?? []).map((g) => [g.enrollment_id, g.published_at]));

  const results: Array<{ email: string; status: "created" | "updated" | "not_found" | "error"; reason?: string }> = [];

  for (const row of rows) {
    const enrollmentId = enrollmentByEmail.get(row.email);
    if (!enrollmentId) {
      results.push({ email: row.email, status: "not_found" });
      continue;
    }

    const grade = row.grade ?? pctToGrade(row.scorePct!, exigencia);
    const isUpdate = existingByEnrollment.has(enrollmentId);
    const publishedAt = publish ? new Date().toISOString() : (existingByEnrollment.get(enrollmentId) ?? null);

    const { error } = await admin.from("evaluation_grades").upsert(
      {
        evaluation_id: evaluationId,
        enrollment_id: enrollmentId,
        grade,
        score_pct: row.scorePct ?? null,
        source: "import",
        feedback: row.comentario ?? null,
        graded_by: auth.user.id,
        graded_at: new Date().toISOString(),
        published_at: publishedAt,
      },
      { onConflict: "evaluation_id,enrollment_id" },
    );

    if (error) {
      results.push({ email: row.email, status: "error", reason: error.message });
    } else {
      results.push({ email: row.email, status: isUpdate ? "updated" : "created" });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const updated = results.filter((r) => r.status === "updated").length;
  return NextResponse.json({ created, updated, results });
}
