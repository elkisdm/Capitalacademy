import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET  /api/admin/evaluations?programId=xxx[&scope=lesson&lessonId=yyy]
//   Lista las evaluaciones de un programa (opcionalmente filtradas por scope o
//   por lección/módulo/sesión). Incluye el conteo de preguntas de cada una.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");
  const scope = searchParams.get("scope");
  const lessonId = searchParams.get("lessonId");
  const moduleId = searchParams.get("moduleId");
  const sessionId = searchParams.get("sessionId");

  if (!programId) {
    return NextResponse.json({ error: "programId es requerido" }, { status: 422 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("evaluations")
    .select("*, quiz_questions(count)")
    .eq("program_id", programId)
    .order("scope", { ascending: true })
    .order("created_at", { ascending: true });

  if (scope) query = query.eq("scope", scope as "final" | "module" | "lesson" | "session");
  if (lessonId) query = query.eq("lesson_id", lessonId);
  if (moduleId) query = query.eq("module_id", moduleId);
  if (sessionId) query = query.eq("session_id", sessionId);

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching evaluations:", error);
    return NextResponse.json({ error: "Error al obtener evaluaciones" }, { status: 500 });
  }

  // Normaliza el conteo embebido a un número plano.
  const evaluations = (data ?? []).map((e) => {
    const { quiz_questions, ...rest } = e as typeof e & {
      quiz_questions?: { count: number }[];
    };
    return { ...rest, questionCount: quiz_questions?.[0]?.count ?? 0 };
  });

  return NextResponse.json({ evaluations });
}

// ---------------------------------------------------------------------------
// POST  /api/admin/evaluations
//   Crea una evaluación ligada a una lección, un módulo, o el programa (final).
// ---------------------------------------------------------------------------

const isoDatetime = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida");

const createSchema = z
  .object({
    programId: uuidLike,
    scope: z.enum(["final", "module", "lesson", "session"]),
    moduleId: uuidLike.optional(),
    lessonId: uuidLike.optional(),
    sessionId: uuidLike.optional(),
    title: z.string().trim().min(1, "El título es requerido").max(200),
    description: z.string().trim().max(2000).optional(),
    // 'quiz' (default, compat con todos los llamadores existentes) | 'manual'
    // (roleplay, guión de venta, etc — sin preguntas, se califica a mano).
    // NO editable tras la creación (ver PATCH: no acepta `kind`).
    kind: z.enum(["quiz", "manual"]).optional(),
    weightPct: z.number().min(0).max(100).nullable().optional(),
    passingGradePct: z.number().int().min(1).max(100).optional(),
    questionsPerAttempt: z.number().int().min(1).max(200).nullable().optional(),
    maxAttempts: z.number().int().min(1).max(50).optional(),
    timeLimitMinutes: z.number().int().min(1).max(600).nullable().optional(),
    minCompletionPct: z.number().int().min(1).max(100).nullable().optional(),
    isActive: z.boolean().optional(),
    // Ventana de programación (0070). NULL/ausente = sin límite en ese extremo.
    opensAt: isoDatetime.nullable().optional(),
    closesAt: isoDatetime.nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.opensAt && val.closesAt && new Date(val.closesAt) <= new Date(val.opensAt)) {
      ctx.addIssue({
        code: "custom",
        message: "La fecha de cierre debe ser posterior a la de apertura",
        path: ["closesAt"],
      });
    }
    // Coherencia de alcance ↔ target (espeja el CHECK evaluations_scope_target,
    // ampliado en 0040 con la rama session).
    if (val.scope === "module" && !val.moduleId) {
      ctx.addIssue({ code: "custom", message: "moduleId es requerido para scope=module", path: ["moduleId"] });
    }
    if (val.scope === "lesson" && !val.lessonId) {
      ctx.addIssue({ code: "custom", message: "lessonId es requerido para scope=lesson", path: ["lessonId"] });
    }
    if (val.scope === "session" && !val.sessionId) {
      ctx.addIssue({ code: "custom", message: "sessionId es requerido para scope=session", path: ["sessionId"] });
    }
    if (val.scope === "final" && (val.moduleId || val.lessonId || val.sessionId)) {
      ctx.addIssue({ code: "custom", message: "scope=final no lleva módulo, lección ni sesión", path: ["scope"] });
    }
    if (val.scope === "lesson" && (val.moduleId || val.sessionId)) {
      ctx.addIssue({ code: "custom", message: "scope=lesson no lleva moduleId ni sessionId", path: ["scope"] });
    }
    if (val.scope === "module" && (val.lessonId || val.sessionId)) {
      ctx.addIssue({ code: "custom", message: "scope=module no lleva lessonId ni sessionId", path: ["scope"] });
    }
    if (val.scope === "session" && (val.moduleId || val.lessonId)) {
      ctx.addIssue({ code: "custom", message: "scope=session no lleva moduleId ni lessonId", path: ["scope"] });
    }
  });

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
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
  const v = parsed.data;
  const admin = createAdminClient();

  // Seguridad de tenant: el módulo/lección debe pertenecer al programa.
  if (v.scope === "module") {
    const { data: mod } = await admin
      .from("program_modules")
      .select("id, program_id")
      .eq("id", v.moduleId!)
      .single();
    if (!mod || mod.program_id !== v.programId) {
      return NextResponse.json({ error: "El módulo no pertenece a este programa" }, { status: 422 });
    }
  }
  if (v.scope === "lesson") {
    const { data: lesson } = await admin
      .from("lessons")
      .select("id, program_modules!inner(program_id)")
      .eq("id", v.lessonId!)
      .single();
    const lessonProgramId = (lesson as { program_modules?: { program_id: string } } | null)
      ?.program_modules?.program_id;
    if (!lesson || lessonProgramId !== v.programId) {
      return NextResponse.json({ error: "La lección no pertenece a este programa" }, { status: 422 });
    }
  }
  if (v.scope === "session") {
    // Una sesión pertenece a una cohorte; el programa se valida vía cohort.
    const { data: session } = await admin
      .from("class_sessions")
      .select("id, cohorts!inner(program_id)")
      .eq("id", v.sessionId!)
      .single();
    const sessionProgramId = (session as { cohorts?: { program_id: string } } | null)
      ?.cohorts?.program_id;
    if (!session || sessionProgramId !== v.programId) {
      return NextResponse.json({ error: "La sesión no pertenece a este programa" }, { status: 422 });
    }
  }

  // Invariante "activa ⇒ respondible" (espeja el guard del PATCH): una
  // evaluación recién creada nunca tiene preguntas, así que activarla al
  // crearla dejaría un quiz publicado e irrespondible. Las MANUALES no
  // llevan preguntas y quedan fuera del guard.
  if (v.isActive === true && (v.kind ?? "quiz") !== "manual") {
    return NextResponse.json(
      { error: "No se puede activar una evaluación sin preguntas" },
      { status: 422 },
    );
  }

  const { data: created, error } = await admin
    .from("evaluations")
    .insert({
      program_id: v.programId,
      scope: v.scope,
      module_id: v.scope === "module" ? v.moduleId! : null,
      lesson_id: v.scope === "lesson" ? v.lessonId! : null,
      session_id: v.scope === "session" ? v.sessionId! : null,
      title: v.title,
      description: v.description ?? null,
      kind: v.kind ?? "quiz",
      weight_pct: v.weightPct ?? null,
      passing_grade_pct: v.passingGradePct ?? 70,
      questions_per_attempt: v.questionsPerAttempt ?? null,
      max_attempts: v.maxAttempts ?? 3,
      time_limit_minutes: v.timeLimitMinutes ?? null,
      min_completion_pct: v.scope === "final" ? (v.minCompletionPct ?? 80) : null,
      is_active: v.isActive ?? false,
      opens_at: v.opensAt ?? null,
      closes_at: v.closesAt ?? null,
    })
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation (final duplicado o evaluación activa duplicada).
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "Ya existe una evaluación final o activa para este alcance" },
        { status: 409 },
      );
    }
    // 23514 = check_violation (ej. evaluations_window_chk).
    if ((error as { code?: string }).code === "23514") {
      return NextResponse.json(
        { error: "La fecha de cierre debe ser posterior a la de apertura" },
        { status: 422 },
      );
    }
    console.error("Error creating evaluation:", error);
    return NextResponse.json({ error: "Error al crear la evaluación" }, { status: 500 });
  }

  return NextResponse.json({ evaluation: created }, { status: 201 });
}
