import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { AUDIENCE_STATUSES } from "@/lib/campaigns/audience";
import { surveyQuestionsSchema } from "@/lib/surveys/questions";
import { createRemoteSurvey } from "@/lib/surveys/remote";
import { SurveysNotConfiguredError, surveysConfigStatus } from "@/lib/surveys/config";

export const runtime = "nodejs";

const statusEnum = z.enum(AUDIENCE_STATUSES as unknown as [string, ...string[]]);

// ---------------------------------------------------------------------------
// GET  /api/admin/surveys?programId=xxx
//   Encuestas del entorno + estado de configuración del cruce con hclp.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");
  const parsedProgramId = uuidLike.safeParse(programId ?? "");
  if (!parsedProgramId.success) {
    return NextResponse.json({ error: "programId debe ser un UUID válido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("survey_campaigns")
    .select("*, cohorts(name)")
    .eq("program_id", parsedProgramId.data)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching surveys:", error);
    return NextResponse.json({ error: "Error al obtener las encuestas" }, { status: 500 });
  }

  return NextResponse.json({ surveys: data ?? [], config: surveysConfigStatus() });
}

// ---------------------------------------------------------------------------
// POST  /api/admin/surveys
//   Crea la encuesta en el motor remoto Y su campaña local. No envía.
// ---------------------------------------------------------------------------

const createSchema = z.object({
  programId: uuidLike,
  cohortId: uuidLike.nullable().optional(),
  title: z.string().trim().min(1, "El título es requerido").max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  mode: z.enum(["anonymous", "identified"]),
  questions: surveyQuestionsSchema,
  closesAt: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), "fecha inválida")
    .nullable()
    .optional(),
  audienceStatus: z.array(statusEnum).min(1).optional(),
  audienceSegment: z.string().trim().max(60).nullable().optional(),
});

export async function POST(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
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

  if (v.cohortId) {
    const { data: cohort } = await admin
      .from("cohorts")
      .select("id, program_id")
      .eq("id", v.cohortId)
      .maybeSingle();
    if (!cohort || cohort.program_id !== v.programId) {
      return NextResponse.json(
        { error: "La cohorte no pertenece a este entorno" },
        { status: 422 },
      );
    }
  }

  // 1. Motor remoto primero. Si falla, no queda una campaña local huérfana
  //    apuntando a una encuesta que no existe.
  let remote;
  try {
    remote = await createRemoteSurvey({
      title: v.title,
      description: v.description,
      questions: v.questions,
      mode: v.mode,
      closesAt: v.closesAt,
    });
  } catch (err) {
    if (err instanceof SurveysNotConfiguredError) {
      return NextResponse.json({ error: err.message, missing: err.missing }, { status: 503 });
    }
    console.error("Error creating remote survey:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al crear la encuesta" },
      { status: 502 },
    );
  }

  // 2. Campaña local (el envío y su bitácora sí son nuestros).
  const { data: created, error } = await admin
    .from("survey_campaigns")
    .insert({
      program_id: v.programId,
      cohort_id: v.cohortId ?? null,
      title: v.title,
      external_survey_id: remote.id,
      external_survey_slug: remote.slug,
      external_survey_url: remote.url,
      mode: v.mode,
      audience_status: v.audienceStatus ?? ["active"],
      audience_segment: v.audienceSegment ?? null,
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    // La encuesta remota SÍ quedó creada. Se devuelve su URL para que el
    // trabajo no se pierda: es recuperable a mano desde el panel de
    // capital-admin, y ocultarlo dejaría una encuesta huérfana invisible.
    console.error("Error creating survey campaign:", error);
    return NextResponse.json(
      {
        error:
          "La encuesta se creó en el sistema de encuestas, pero no se pudo registrar el envío aquí",
        remoteUrl: remote.url,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ survey: created }, { status: 201 });
}
