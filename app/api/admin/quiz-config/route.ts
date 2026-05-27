import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";

export const runtime = "nodejs";

const DEFAULTS = {
  min_completion_pct: 80,
  passing_grade_pct: 70,
  questions_per_attempt: 10,
  max_attempts: 3,
  time_limit_minutes: null,
  is_active: false,
} as const;

// ---------------------------------------------------------------------------
// GET  /api/admin/quiz-config?programId=xxx
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

  const { data: config, error } = await admin
    .from("quiz_configs")
    .select("*")
    .eq("program_id", programId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows returned — that's fine, we return defaults
    console.error("Error fetching quiz config:", error);
    return NextResponse.json({ error: "Error al obtener configuracion" }, { status: 500 });
  }

  if (!config) {
    return NextResponse.json({ config: null, defaults: DEFAULTS });
  }

  return NextResponse.json({ config });
}

// ---------------------------------------------------------------------------
// PUT  /api/admin/quiz-config
// ---------------------------------------------------------------------------

export async function PUT(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const {
    programId,
    minCompletionPct,
    passingGradePct,
    questionsPerAttempt,
    maxAttempts,
    timeLimitMinutes,
    isActive,
  } = body as {
    programId?: string;
    minCompletionPct?: number;
    passingGradePct?: number;
    questionsPerAttempt?: number;
    maxAttempts?: number;
    timeLimitMinutes?: number | null;
    isActive?: boolean;
  };

  if (!programId) {
    return NextResponse.json({ error: "programId es requerido" }, { status: 422 });
  }

  const admin = createAdminClient();

  const row: Record<string, unknown> = { program_id: programId };
  if (minCompletionPct !== undefined) row.min_completion_pct = minCompletionPct;
  if (passingGradePct !== undefined) row.passing_grade_pct = passingGradePct;
  if (questionsPerAttempt !== undefined) row.questions_per_attempt = questionsPerAttempt;
  if (maxAttempts !== undefined) row.max_attempts = maxAttempts;
  if (timeLimitMinutes !== undefined) row.time_limit_minutes = timeLimitMinutes;
  if (isActive !== undefined) row.is_active = isActive;

  const { data: config, error } = await admin
    .from("quiz_configs")
    .upsert(row as never, { onConflict: "program_id" })
    .select()
    .single();

  if (error) {
    console.error("Error upserting quiz config:", error);
    return NextResponse.json({ error: "Error al guardar configuracion" }, { status: 500 });
  }

  return NextResponse.json({ config });
}
