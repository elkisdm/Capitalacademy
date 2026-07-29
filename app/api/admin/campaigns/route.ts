import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { AUDIENCE_STATUSES } from "@/lib/campaigns/audience";

export const runtime = "nodejs";

const statusEnum = z.enum(AUDIENCE_STATUSES as unknown as [string, ...string[]]);

// ---------------------------------------------------------------------------
// GET  /api/admin/campaigns?programId=xxx
//   Lista las campañas del entorno, más recientes primero.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");
  if (!programId) {
    return NextResponse.json({ error: "programId es requerido" }, { status: 422 });
  }

  const parsedProgramId = uuidLike.safeParse(programId);
  if (!parsedProgramId.success) {
    return NextResponse.json({ error: "programId debe ser un UUID válido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_campaigns")
    .select("*, cohorts(name)")
    .eq("program_id", parsedProgramId.data)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching campaigns:", error);
    return NextResponse.json({ error: "Error al obtener las campañas" }, { status: 500 });
  }

  return NextResponse.json({ campaigns: data ?? [] });
}

// ---------------------------------------------------------------------------
// POST  /api/admin/campaigns
//   Crea un borrador. Nunca envía: el envío es un paso explícito y aparte
//   (POST .../send), para que un error de tipeo no salga a cientos de alumnos.
// ---------------------------------------------------------------------------

const createSchema = z
  .object({
    programId: uuidLike,
    cohortId: uuidLike.nullable().optional(),
    subject: z.string().trim().min(1, "El asunto es requerido").max(200),
    preheader: z.string().trim().max(200).nullable().optional(),
    bodyMd: z.string().trim().min(1, "El cuerpo es requerido").max(20000),
    ctaLabel: z.string().trim().max(60).nullable().optional(),
    ctaUrl: z.string().trim().url("El enlace del botón debe ser una URL válida").nullable().optional(),
    audienceStatus: z.array(statusEnum).min(1).optional(),
    audienceSegment: z.string().trim().max(60).nullable().optional(),
  })
  // Un CTA a medias renderiza un botón roto; el CHECK de la 0082 lo rechazaría
  // con un 23514 poco explicativo, así que se valida antes con un mensaje claro.
  .refine((v) => Boolean(v.ctaLabel) === Boolean(v.ctaUrl), {
    message: "El botón necesita texto y enlace, o ninguno de los dos",
    path: ["ctaLabel"],
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

  // La cohorte debe pertenecer al programa: sin esta validación se podría
  // segmentar por una cohorte de OTRO entorno y mandarle el comunicado
  // equivocado a un tenant distinto.
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

  const { data: created, error } = await admin
    .from("email_campaigns")
    .insert({
      program_id: v.programId,
      cohort_id: v.cohortId ?? null,
      subject: v.subject,
      preheader: v.preheader ?? null,
      body_md: v.bodyMd,
      cta_label: v.ctaLabel ?? null,
      cta_url: v.ctaUrl ?? null,
      audience_status: v.audienceStatus ?? ["active"],
      audience_segment: v.audienceSegment ?? null,
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating campaign:", error);
    if (error.code === "23514") {
      return NextResponse.json({ error: "Datos fuera de rango" }, { status: 422 });
    }
    return NextResponse.json({ error: "Error al crear la campaña" }, { status: 500 });
  }

  return NextResponse.json({ campaign: created }, { status: 201 });
}
