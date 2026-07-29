/**
 * Despacho de un comunicado masivo.
 *
 * Implementa el patrón obligatorio de ADR-0020, el mismo que
 * `lib/deliverables/notify.ts` y el cron de recordatorios:
 *
 *   reclamo atómico → bitácora por destinatario → sendEmailBatch → estado terminal
 *
 * Las tres partes importan y ninguna es adorno:
 *
 * - **Reclamo atómico**: un `update ... where status in ('draft','failed')` que
 *   devuelve fila. Postgres re-evalúa el WHERE contra el valor comprometido, así
 *   que de dos clics simultáneos en "Enviar" solo uno gana la fila.
 * - **Bitácora**: `missing = audiencia − ya_entregados`. Un reintento tras un
 *   fallo parcial NO reenvía a quien ya recibió. Sin esto, reintentar 35
 *   destinatarios de los que 30 recibieron manda 30 duplicados.
 * - **Estado terminal solo sin fallos**: con entrega parcial la campaña queda
 *   `failed` (reintentable), nunca `sent`. Marcar `sent` con entregas parciales
 *   es exactamente el bug que ADR-0020 documentó en prod: 4 de 5 corridas
 *   históricas de recordatorios perdieron correos para siempre.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { buildCampaignEmail } from "@/lib/email/campaign";
import { sendEmailBatch, type BatchMessage } from "@/lib/email/send-batch";
import { getBrandByProgramId } from "@/lib/programs/registry";
import { resolveAudience } from "@/lib/campaigns/audience";

/**
 * Ventana tras la cual un envío marcado `sending` se considera muerto (el
 * proceso cayó a mitad del lote) y es reclamable de nuevo. Mismo criterio que
 * `lib/deliverables/notify.ts`: mayor que el maxDuration de la función (60s)
 * para no pisar una corrida viva.
 */
const RETRY_STALE_MS = 10 * 60 * 1000;

export type CampaignSendResult =
  | { status: "skipped"; reason: string }
  | { status: "sent"; sent: number; alreadySent: number; total: number }
  | { status: "partial"; sent: number; failed: number; alreadySent: number; total: number };

type CampaignRow = {
  id: string;
  program_id: string;
  cohort_id: string | null;
  subject: string;
  preheader: string | null;
  body_md: string;
  cta_label: string | null;
  cta_url: string | null;
  audience_status: string[] | null;
  audience_segment: string | null;
};

const CAMPAIGN_COLUMNS =
  "id, program_id, cohort_id, subject, preheader, body_md, cta_label, cta_url, audience_status, audience_segment";

export async function sendEmailCampaign(campaignId: string): Promise<CampaignSendResult> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const staleCutoffIso = new Date(Date.now() - RETRY_STALE_MS).toISOString();

  // --- Reclamo -------------------------------------------------------------
  const { data: claimed, error: claimError } = await admin
    .from("email_campaigns")
    .update({ status: "sending", send_started_at: nowIso, error: null })
    .eq("id", campaignId)
    .in("status", ["draft", "failed"])
    .select(CAMPAIGN_COLUMNS)
    .maybeSingle();

  if (claimError) {
    console.error("sendEmailCampaign claim error", claimError);
    return { status: "skipped", reason: "No se pudo reclamar la campaña" };
  }

  let campaign = claimed as CampaignRow | null;

  if (!campaign) {
    // No estaba en draft/failed. Solo es reintentable si quedó 'sending' viejo
    // (crash a mitad del lote); si está 'sent' o 'sending' reciente, se aborta.
    const { data: stale } = await admin
      .from("email_campaigns")
      .update({ status: "sending", send_started_at: nowIso })
      .eq("id", campaignId)
      .eq("status", "sending")
      .lt("send_started_at", staleCutoffIso)
      .select(CAMPAIGN_COLUMNS)
      .maybeSingle();
    campaign = stale as CampaignRow | null;
  }

  if (!campaign) {
    return { status: "skipped", reason: "La campaña ya fue enviada o hay un envío en curso" };
  }

  // --- Audiencia -----------------------------------------------------------
  let audience;
  try {
    audience = await resolveAudience(admin, {
      programId: campaign.program_id,
      cohortId: campaign.cohort_id,
      statuses: campaign.audience_status ?? ["active"],
      segment: campaign.audience_segment,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error resolviendo la audiencia";
    await admin
      .from("email_campaigns")
      .update({ status: "failed", error: message })
      .eq("id", campaignId);
    return { status: "skipped", reason: message };
  }

  if (audience.length === 0) {
    await admin
      .from("email_campaigns")
      .update({
        status: "failed",
        recipients_count: 0,
        error: "La audiencia quedó vacía con los filtros elegidos",
      })
      .eq("id", campaignId);
    return { status: "skipped", reason: "La audiencia quedó vacía con los filtros elegidos" };
  }

  // --- Bitácora: a quién le falta -----------------------------------------
  const { data: ledger, error: ledgerError } = await admin
    .from("email_campaign_recipients")
    .select("student_id")
    .eq("campaign_id", campaignId)
    .eq("channel", "email")
    .eq("status", "sent");

  if (ledgerError) {
    console.error("sendEmailCampaign ledger read error", ledgerError);
    await admin
      .from("email_campaigns")
      .update({ status: "failed", error: "No se pudo leer la bitácora de envío" })
      .eq("id", campaignId);
    return { status: "skipped", reason: "No se pudo leer la bitácora de envío" };
  }

  const alreadyDelivered = new Set(
    ((ledger ?? []) as Array<{ student_id: string }>).map((r) => r.student_id),
  );
  const missing = audience.filter((r) => !alreadyDelivered.has(r.studentId));

  if (missing.length === 0) {
    await admin
      .from("email_campaigns")
      .update({
        status: "sent",
        recipients_count: audience.length,
        sent_count: alreadyDelivered.size,
        sent_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", campaignId);
    return {
      status: "sent",
      sent: 0,
      alreadySent: alreadyDelivered.size,
      total: audience.length,
    };
  }

  // --- Envío ---------------------------------------------------------------
  const brand = getBrandByProgramId(campaign.program_id);
  const byEmail = new Map(missing.map((r) => [r.email, r]));

  const messages: BatchMessage[] = missing.map((r) => ({
    to: r.email,
    ...buildCampaignEmail({
      subject: campaign.subject,
      bodyMd: campaign.body_md,
      preheader: campaign.preheader,
      ctaLabel: campaign.cta_label,
      ctaUrl: campaign.cta_url,
      fullName: r.fullName,
      brand,
    }),
  }));

  const outcome = await sendEmailBatch(messages, `ec:${campaignId}`);

  // --- Bitácora: registrar el resultado ------------------------------------
  const ledgerRows = [
    ...outcome.sent.map((to) => ({
      campaign_id: campaignId,
      student_id: byEmail.get(to)!.studentId,
      email: to,
      channel: "email",
      status: "sent",
      error: null as string | null,
    })),
    ...outcome.failed.map((f) => ({
      campaign_id: campaignId,
      student_id: byEmail.get(f.to)!.studentId,
      email: f.to,
      channel: "email",
      status: "failed",
      error: f.error,
    })),
  ];

  if (ledgerRows.length > 0) {
    const { error: writeError } = await admin
      .from("email_campaign_recipients")
      .upsert(ledgerRows, { onConflict: "campaign_id,channel,student_id" });
    if (writeError) console.error("sendEmailCampaign ledger write error", writeError);
  }

  const deliveredTotal = alreadyDelivered.size + outcome.sent.length;

  if (outcome.failed.length > 0) {
    await admin
      .from("email_campaigns")
      .update({
        status: "failed",
        recipients_count: audience.length,
        sent_count: deliveredTotal,
        error: `${outcome.failed.length} de ${messages.length} correos fallaron. Reintenta para enviar solo a los que faltan.`,
      })
      .eq("id", campaignId);

    return {
      status: "partial",
      sent: outcome.sent.length,
      failed: outcome.failed.length,
      alreadySent: alreadyDelivered.size,
      total: audience.length,
    };
  }

  await admin
    .from("email_campaigns")
    .update({
      status: "sent",
      recipients_count: audience.length,
      sent_count: deliveredTotal,
      sent_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", campaignId);

  return {
    status: "sent",
    sent: outcome.sent.length,
    alreadySent: alreadyDelivered.size,
    total: audience.length,
  };
}
