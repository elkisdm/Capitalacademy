import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET  /api/admin/quiz-attempts?programId=xxx
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");

  if (!programId) {
    return NextResponse.json({ error: "programId es requerido" }, { status: 422 });
  }

  const admin = createAdminClient();

  // La pestaña "Intentos" es del EXAMEN FINAL. Acotamos a la evaluación
  // scope='final' para no mezclar los intentos de los quizzes formativos por
  // clase (que comparten program_id).
  const { data: finalEval } = await admin
    .from("evaluations")
    .select("id")
    .eq("program_id", programId)
    .eq("scope", "final")
    .maybeSingle();

  if (!finalEval) {
    return NextResponse.json({ attempts: [] });
  }

  const { data: attempts, error } = await admin
    .from("quiz_attempts")
    .select("id, score_pct, passed, started_at, completed_at, enrollments(student_id, profiles(full_name))")
    .eq("evaluation_id", finalEval.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching quiz attempts:", error);
    return NextResponse.json({ error: "Error al obtener intentos" }, { status: 500 });
  }

  const mapped = (attempts ?? []).map((a) => {
    const enrollment = a.enrollments as unknown as {
      student_id: string;
      profiles: { full_name: string | null };
    } | null;

    return {
      id: a.id,
      studentName: enrollment?.profiles?.full_name ?? "Sin nombre",
      scorePct: a.score_pct,
      passed: a.passed,
      startedAt: a.started_at,
      completedAt: a.completed_at,
    };
  });

  return NextResponse.json({ attempts: mapped });
}
