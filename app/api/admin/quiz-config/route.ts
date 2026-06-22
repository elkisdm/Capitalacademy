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

  // Config del quiz final = evaluación scope='final' del programa (unificado 0033).
  const { data: config, error } = await admin
    .from("evaluations")
    .select("*")
    .eq("program_id", programId)
    .eq("scope", "final")
    .maybeSingle();

  if (error) {
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

  const fields: Record<string, unknown> = {};
  if (minCompletionPct !== undefined) fields.min_completion_pct = minCompletionPct;
  if (passingGradePct !== undefined) fields.passing_grade_pct = passingGradePct;
  if (questionsPerAttempt !== undefined) fields.questions_per_attempt = questionsPerAttempt;
  if (maxAttempts !== undefined) fields.max_attempts = maxAttempts;
  if (timeLimitMinutes !== undefined) fields.time_limit_minutes = timeLimitMinutes;
  if (isActive !== undefined) fields.is_active = isActive;

  // La evaluación final usa un índice único parcial (program_id WHERE scope='final'),
  // así que no se puede upsert por onConflict: buscamos y actualizamos o insertamos.
  const { data: existing } = await admin
    .from("evaluations")
    .select("id")
    .eq("program_id", programId)
    .eq("scope", "final")
    .maybeSingle();

  let config;
  if (existing) {
    const res = await admin
      .from("evaluations")
      .update(fields as never)
      .eq("id", existing.id)
      .select()
      .single();
    config = res.data;
    if (res.error) {
      console.error("Error updating quiz config:", res.error);
      return NextResponse.json({ error: "Error al guardar configuracion" }, { status: 500 });
    }
  } else {
    const res = await admin
      .from("evaluations")
      .insert({
        program_id: programId,
        scope: "final",
        title: "Evaluación final",
        min_completion_pct: minCompletionPct ?? DEFAULTS.min_completion_pct,
        passing_grade_pct: passingGradePct ?? DEFAULTS.passing_grade_pct,
        questions_per_attempt: questionsPerAttempt ?? DEFAULTS.questions_per_attempt,
        max_attempts: maxAttempts ?? DEFAULTS.max_attempts,
        time_limit_minutes: timeLimitMinutes ?? DEFAULTS.time_limit_minutes,
        is_active: isActive ?? DEFAULTS.is_active,
      })
      .select()
      .single();
    config = res.data;
    if (res.error) {
      console.error("Error creating quiz config:", res.error);
      return NextResponse.json({ error: "Error al guardar configuracion" }, { status: 500 });
    }
  }

  return NextResponse.json({ config });
}
