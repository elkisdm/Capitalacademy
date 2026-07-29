import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { uuidLike } from "@/lib/utils/zod";
import { buildCampaignEmail } from "@/lib/email/campaign";
import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";
import { getBrandByProgramId } from "@/lib/programs/registry";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ campaignId: string }> };

/**
 * POST /api/admin/campaigns/[campaignId]/test
 *
 * Envía UNA copia del comunicado a la casilla del propio admin autenticado.
 *
 * El destinatario NO se acepta por body a propósito: si se pudiera elegir, este
 * endpoint sería un relay para mandar correo con la marca de Capital Academy a
 * cualquier dirección. Se envía a `auth.user.email` y a nadie más.
 *
 * No toca la bitácora de la campaña: una prueba no cuenta como entrega.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { campaignId } = await ctx.params;
  if (!uuidLike.safeParse(campaignId).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const to = auth.user.email;
  if (!to) {
    return NextResponse.json(
      { error: "Tu cuenta no tiene un correo asociado" },
      { status: 422 },
    );
  }

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("email_campaigns")
    .select("program_id, subject, preheader, body_md, cta_label, cta_url")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) {
    return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", auth.user.id)
    .maybeSingle();

  const content = buildCampaignEmail({
    subject: `[PRUEBA] ${campaign.subject}`,
    bodyMd: campaign.body_md,
    preheader: campaign.preheader,
    ctaLabel: campaign.cta_label,
    ctaUrl: campaign.cta_url,
    fullName: profile?.full_name ?? null,
    brand: getBrandByProgramId(campaign.program_id),
  });

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    if (error) {
      console.error("Error sending campaign test:", error);
      return NextResponse.json({ error: "Resend rechazó el correo de prueba" }, { status: 502 });
    }
  } catch (err) {
    console.error("Error sending campaign test:", err);
    return NextResponse.json({ error: "Error al enviar el correo de prueba" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, to });
}
