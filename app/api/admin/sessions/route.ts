import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { moduleInProgramError } from "@/lib/admin/session-module";

export const runtime = "nodejs";

const modalitySchema = z.enum(["live_in_person", "live_online", "recorded"]);
const audienceSchema = z.enum(["all", "capital_inteligente"]);
const statusSchema = z.enum([
  "scheduled",
  "in_progress",
  "finished",
  "cancelled",
]);

const createSessionSchema = z.object({
  cohort_id: uuidLike,
  title: z.string().trim().min(2).max(160),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  modality: modalitySchema,
  teacher_id: uuidLike.nullable().optional(),
  module_id: uuidLike.nullable().optional(),
  meeting_url: z.string().trim().url().max(500).nullable().optional(),
  audience: audienceSchema.default("all"),
  status: statusSchema.default("scheduled"),
});

/**
 * GET /api/admin/sessions?cohort_id=<uuid>
 * Lista las sesiones de un cohorte ordenadas por fecha de inicio.
 */
export async function GET(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const cohortId = searchParams.get("cohort_id");

  const parsedCohort = uuidLike.safeParse(cohortId);
  if (!parsedCohort.success) {
    return NextResponse.json(
      { error: "cohort_id es requerido y debe ser un UUID válido" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("class_sessions")
    .select("*")
    .eq("cohort_id", parsedCohort.data)
    .order("starts_at", { ascending: true });

  if (error) {
    console.error("sessions list error", error);
    return NextResponse.json(
      { error: "Error al listar las sesiones" },
      { status: 500 },
    );
  }

  return NextResponse.json({ sessions: data ?? [] });
}

/**
 * POST /api/admin/sessions
 * Crea una nueva sesión de clase para un cohorte.
 */
export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const {
    cohort_id,
    title,
    starts_at,
    ends_at,
    modality,
    teacher_id,
    module_id,
    meeting_url,
    audience,
    status,
  } = parsed.data;

  if (new Date(ends_at).getTime() <= new Date(starts_at).getTime()) {
    return NextResponse.json(
      { error: "La hora de término debe ser posterior al inicio" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();

  const { data: cohort } = await admin
    .from("cohorts")
    .select("id, program_id")
    .eq("id", cohort_id)
    .single();

  if (!cohort) {
    return NextResponse.json(
      { error: "Cohorte no encontrada" },
      { status: 404 },
    );
  }

  // El módulo (si se asigna) debe pertenecer al programa de la cohorte.
  const moduleError = await moduleInProgramError(
    admin,
    cohort.program_id,
    module_id,
  );
  if (moduleError) {
    return NextResponse.json({ error: moduleError }, { status: 422 });
  }

  const insertRow = {
    cohort_id,
    title,
    starts_at,
    ends_at,
    modality,
    teacher_id: teacher_id ?? null,
    module_id: module_id ?? null,
    meeting_url: meeting_url ?? null,
    audience,
    status,
    created_by: auth.user.id,
  };

  const { data, error } = await admin
    .from("class_sessions")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) {
    console.error("session create error", error);
    return NextResponse.json(
      { error: "Error al crear la sesión" },
      { status: 500 },
    );
  }

  return NextResponse.json({ session: data }, { status: 201 });
}
