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
 * Casilla del equipo académico: siempre recibe copia de las pruebas, para que
 * la revisión no dependa de quién esté conectado. Configurable por si cambia.
 */
const TEAM_INBOX = process.env.CAMPAIGN_TEST_EMAIL?.trim() || "academia@capitalinteligente.cl";

/**
 * Dominios que Capital Academy usa para ENVIAR pero que no reciben correo (sin
 * registros MX). Una dirección de estos dominios es válida y Resend la acepta,
 * pero el correo se pierde en silencio — verificado el 2026-07-29:
 * `dig MX capitalacademy.cl` no devuelve nada.
 */
const NON_RECEIVING_DOMAINS = new Set(["capitalacademy.cl"]);

/**
 * POST /api/admin/campaigns/[campaignId]/test    body opcional: { to }
 *
 * Envía una copia del comunicado a DOS destinos: la casilla del equipo
 * académico y la de quien está creando la campaña (para que vea su propio
 * borrador). Se deduplican si coinciden. Con `to` se reemplaza la casilla del
 * equipo por otra; la copia al autor se mantiene siempre.
 *
 * Los destinatarios están restringidos a correos que ya pertenecen a una cuenta
 * con `system_role` ops/admin (más la casilla del equipo, que es configuración
 * del servidor). No es una lista blanca decorativa: sin ella, este endpoint
 * sería un relay para mandar correo con la marca de Capital Academy a cualquier
 * dirección del mundo.
 *
 * OJO — un destino puede ser válido y aun así no recibir nada: el dominio
 * `capitalacademy.cl` NO tiene registros MX (sirve para enviar, no para
 * recibir), así que `admin@capitalacademy.cl` —la cuenta con la que se entra al
 * panel— acepta el envío y lo pierde. Esos destinos se OMITEN del envío y se
 * devuelven en `skipped`; la respuesta trae además `to[]` con lo realmente
 * enviado.
 *
 * No toca la bitácora de la campaña: una prueba no cuenta como entrega.
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { campaignId } = await ctx.params;
  if (!uuidLike.safeParse(campaignId).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 422 });
  }

  const admin = createAdminClient();

  // Body opcional: un POST sin cuerpo es válido y significa "a mí mismo".
  let requestedTo: string | null = null;
  try {
    const body = (await req.json()) as { to?: unknown };
    if (typeof body?.to === "string" && body.to.trim()) requestedTo = body.to.trim();
  } catch {
    // sin body
  }

  const { data: staff } = await admin
    .from("profiles")
    .select("email")
    .in("system_role", ["ops", "admin"]);

  const allowed = new Set(
    ((staff ?? []) as Array<{ email: string | null }>)
      .map((s) => s.email?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e)),
  );
  // La casilla del equipo viene de configuración del servidor, no del cliente:
  // es confiable aunque no exista como perfil.
  allowed.add(TEAM_INBOX.toLowerCase());

  // Casilla del equipo (o la pedida) + copia al autor, sin repetir.
  const requested = [...new Set(
    [requestedTo ?? TEAM_INBOX, auth.user.email]
      .filter((e): e is string => Boolean(e && e.trim()))
      .map((e) => e.trim()),
  )];

  // Se DESCARTAN los destinos cuyo dominio no puede recibir correo, en vez de
  // enviarles y avisar: mandarle a un buzón inexistente no informa a nadie y
  // acumula entregas fallidas en la reputación de la cuenta de Resend.
  const skipped = requested.filter((e) =>
    NON_RECEIVING_DOMAINS.has(e.split("@")[1]?.toLowerCase() ?? ""),
  );
  const recipients = requested.filter((e) => !skipped.includes(e));

  if (recipients.length === 0) {
    return NextResponse.json(
      {
        error:
          skipped.length > 0
            ? `No queda ninguna casilla que pueda recibir la prueba (${skipped.join(", ")} pertenece a un dominio sin correo). Configura CAMPAIGN_TEST_EMAIL o indica otro destino.`
            : "No hay ninguna casilla a la que enviar la prueba",
      },
      { status: 422 },
    );
  }

  const notAllowed = recipients.filter((e) => !allowed.has(e.toLowerCase()));
  if (notAllowed.length > 0) {
    return NextResponse.json(
      {
        error: `La prueba solo se puede enviar a casillas del equipo (rechazado: ${notAllowed.join(", ")})`,
      },
      { status: 403 },
    );
  }
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
      to: recipients,
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

  // `skipped` son destinos válidos que se omitieron a propósito por pertenecer
  // a un dominio que no recibe correo. Se informan para que quede claro por qué
  // alguien no recibió su copia.
  return NextResponse.json({ ok: true, to: recipients, skipped });
}
