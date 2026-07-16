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
//   Auto-publica: el import resuelve directamente la urgencia de la profe
//   (notas de roleplay que ya existen en un Excel), igual que las de quiz.
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
  const { cohortId, rows } = parsed.data;

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

  const results: Array<{ email: string; status: "created" | "not_found" | "error"; reason?: string }> = [];

  for (const row of rows) {
    const enrollmentId = enrollmentByEmail.get(row.email);
    if (!enrollmentId) {
      results.push({ email: row.email, status: "not_found" });
      continue;
    }

    const grade = row.grade ?? pctToGrade(row.scorePct!, exigencia);

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
        published_at: new Date().toISOString(),
      },
      { onConflict: "evaluation_id,enrollment_id" },
    );

    if (error) {
      results.push({ email: row.email, status: "error", reason: error.message });
    } else {
      results.push({ email: row.email, status: "created" });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  return NextResponse.json({ created, results });
}
