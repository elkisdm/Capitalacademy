import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { AUDIENCE_STATUSES } from "@/lib/campaigns/audience";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ campaignId: string }> };
type CampaignUpdate = Database["public"]["Tables"]["email_campaigns"]["Update"];

const statusEnum = z.enum(AUDIENCE_STATUSES as unknown as [string, ...string[]]);

/**
 * Una campaña solo es mutable mientras no haya salido. `sending` se excluye
 * además porque editar el cuerpo a mitad de un lote produciría dos versiones
 * distintas del mismo comunicado en las bandejas de los alumnos.
 */
const MUTABLE_STATUSES = ["draft", "failed"];

// ---------------------------------------------------------------------------
// GET  /api/admin/campaigns/[campaignId]
//   Detalle + resumen de la bitácora de envío.
// ---------------------------------------------------------------------------

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { campaignId } = await ctx.params;
  if (!uuidLike.safeParse(campaignId).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: campaign, error } = await admin
    .from("email_campaigns")
    .select("*, cohorts(name)")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching campaign:", error);
    return NextResponse.json({ error: "Error al obtener la campaña" }, { status: 500 });
  }
  if (!campaign) {
    return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  }

  const { data: ledger } = await admin
    .from("email_campaign_recipients")
    .select("status, email, error")
    .eq("campaign_id", campaignId);

  const rows = (ledger ?? []) as Array<{ status: string; email: string; error: string | null }>;

  return NextResponse.json({
    campaign,
    delivery: {
      sent: rows.filter((r) => r.status === "sent").length,
      failed: rows.filter((r) => r.status === "failed").length,
      // Solo los fallidos se listan: sirven para diagnosticar (correo inválido,
      // rebote). Los entregados son un conteo, no una lista de PII.
      failures: rows
        .filter((r) => r.status === "failed")
        .slice(0, 50)
        .map((r) => ({ email: r.email, error: r.error })),
    },
  });
}

// ---------------------------------------------------------------------------
// PATCH  /api/admin/campaigns/[campaignId]
// ---------------------------------------------------------------------------

const patchSchema = z
  .object({
    cohortId: uuidLike.nullable().optional(),
    subject: z.string().trim().min(1).max(200).optional(),
    preheader: z.string().trim().max(200).nullable().optional(),
    bodyMd: z.string().trim().min(1).max(20000).optional(),
    ctaLabel: z.string().trim().max(60).nullable().optional(),
    ctaUrl: z.string().trim().url("El enlace del botón debe ser una URL válida").nullable().optional(),
    audienceStatus: z.array(statusEnum).min(1).optional(),
    audienceSegment: z.string().trim().max(60).nullable().optional(),
    // Selección manual (0092). `null` explícito quita la selección y vuelve a
    // "toda la audiencia del filtro"; una lista vacía no es un caso válido.
    audienceStudentIds: z.array(uuidLike).min(1).nullable().optional(),
  })
  // El botón se actualiza COMPLETO o no se toca. Mandar solo un lado dejaba
  // pasar la validación (el otro queda `undefined`) y la incoherencia la
  // atrapaba recién el CHECK de la 0082, con un 422 genérico e ininteligible.
  .refine(
    (v) => {
      const touched = "ctaLabel" in v || "ctaUrl" in v;
      if (!touched) return true;
      return "ctaLabel" in v && "ctaUrl" in v && Boolean(v.ctaLabel) === Boolean(v.ctaUrl);
    },
    {
      message:
        "El botón se actualiza completo: manda texto y enlace juntos, o ambos en null para quitarlo",
      path: ["ctaLabel"],
    },
  );

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { campaignId } = await ctx.params;
  if (!uuidLike.safeParse(campaignId).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const v = parsed.data;
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("email_campaigns")
    .select("id, status, program_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  }
  if (!MUTABLE_STATUSES.includes(existing.status)) {
    return NextResponse.json(
      { error: "Una campaña enviada o en curso no se puede editar" },
      { status: 409 },
    );
  }

  if (v.cohortId) {
    const { data: cohort } = await admin
      .from("cohorts")
      .select("id, program_id")
      .eq("id", v.cohortId)
      .maybeSingle();
    if (!cohort || cohort.program_id !== existing.program_id) {
      return NextResponse.json(
        { error: "La cohorte no pertenece a este entorno" },
        { status: 422 },
      );
    }
  }

  const patch: CampaignUpdate = {};
  if ("cohortId" in v) patch.cohort_id = v.cohortId ?? null;
  if (v.subject !== undefined) patch.subject = v.subject;
  if ("preheader" in v) patch.preheader = v.preheader ?? null;
  if (v.bodyMd !== undefined) patch.body_md = v.bodyMd;
  if ("ctaLabel" in v) patch.cta_label = v.ctaLabel ?? null;
  if ("ctaUrl" in v) patch.cta_url = v.ctaUrl ?? null;
  if (v.audienceStatus !== undefined) patch.audience_status = v.audienceStatus;
  if ("audienceSegment" in v) patch.audience_segment = v.audienceSegment ?? null;
  if ("audienceStudentIds" in v) patch.audience_student_ids = v.audienceStudentIds ?? null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 422 });
  }

  const { data: updated, error } = await admin
    .from("email_campaigns")
    .update(patch)
    .eq("id", campaignId)
    .select()
    .single();

  if (error) {
    console.error("Error updating campaign:", error);
    if (error.code === "23514") {
      return NextResponse.json({ error: "Datos fuera de rango" }, { status: 422 });
    }
    return NextResponse.json({ error: "Error al actualizar la campaña" }, { status: 500 });
  }

  return NextResponse.json({ campaign: updated });
}

// ---------------------------------------------------------------------------
// DELETE  /api/admin/campaigns/[campaignId]
//   Solo borradores/fallidas. Una campaña enviada es registro histórico de a
//   quién se le escribió: borrarla perdería la bitácora por cascada.
// ---------------------------------------------------------------------------

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { campaignId } = await ctx.params;
  if (!uuidLike.safeParse(campaignId).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("email_campaigns")
    .select("id, status, sent_count")
    .eq("id", campaignId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  }
  if (existing.status === "sent" || existing.status === "sending" || existing.sent_count > 0) {
    return NextResponse.json(
      { error: "No se puede borrar una campaña que ya envió correos" },
      { status: 409 },
    );
  }

  const { error } = await admin.from("email_campaigns").delete().eq("id", campaignId);
  if (error) {
    console.error("Error deleting campaign:", error);
    return NextResponse.json({ error: "Error al borrar la campaña" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
