import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function authorizeAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ops", "admin"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  }

  return { user };
}

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

  const { data: attempts, error } = await admin
    .from("quiz_attempts")
    .select("id, score_pct, passed, started_at, completed_at, enrollments(student_id, profiles(full_name))")
    .eq("program_id", programId)
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
