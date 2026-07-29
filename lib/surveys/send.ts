/**
 * Despacho de una encuesta a un grupo de alumnos.
 *
 * Dos caminos, según el modo, y NO son intercambiables:
 *
 *   anonymous  → Capital Academy envía el correo (Resend propio + branding del
 *                entorno) con un enlace IDÉNTICO para todos.
 *   identified → Capital Academy no envía nada: delega en el endpoint de
 *                ingesta de hclp, que emite un token por persona y despacha
 *                correo + WhatsApp.
 *
 * Mismo esqueleto de ADR-0020 que `lib/campaigns/send.ts`: reclamo atómico →
 * bitácora por destinatario → despacho → estado terminal solo sin fallos.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { buildSurveyInvitationEmail } from "@/lib/email/survey-invitation";
import { sendEmailBatch, type BatchMessage } from "@/lib/email/send-batch";
import { getBrandByProgramId } from "@/lib/programs/registry";
import { resolveAudience } from "@/lib/campaigns/audience";
import { enrollRemoteRecipients } from "@/lib/surveys/remote";

const RETRY_STALE_MS = 10 * 60 * 1000;

export type SurveySendResult =
  | { status: "skipped"; reason: string }
  | { status: "sent"; sent: number; alreadySent: number; total: number }
  | { status: "partial"; sent: number; failed: number; alreadySent: number; total: number };

type SurveyCampaignRow = {
  id: string;
  program_id: string;
  cohort_id: string | null;
  title: string;
  mode: "anonymous" | "identified";
  external_survey_slug: string;
  external_survey_url: string;
  audience_status: string[] | null;
  audience_segment: string | null;
};

const COLUMNS =
  "id, program_id, cohort_id, title, mode, external_survey_slug, external_survey_url, audience_status, audience_segment";

/**
 * Última línea de defensa del anonimato. Si alguien alguna vez construye la URL
 * concatenando un identificador, el envío se detiene aquí en vez de mandar
 * cientos de enlaces personalizados bajo una promesa de anonimato.
 */
export function assertAnonymousUrl(url: string): void {
  const forbidden = ["t=", "token=", "email=", "uid=", "id=", "rut="];
  const query = url.split("?")[1] ?? "";
  const offender = forbidden.find((param) =>
    query.split("&").some((pair) => pair.toLowerCase().startsWith(param)),
  );
  if (offender) {
    throw new Error(
      `El enlace de una encuesta anónima no puede llevar identificador (encontrado: "${offender.replace("=", "")}")`,
    );
  }
}

export async function sendSurveyCampaign(campaignId: string): Promise<SurveySendResult> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const staleCutoffIso = new Date(Date.now() - RETRY_STALE_MS).toISOString();

  // --- Reclamo -------------------------------------------------------------
  const { data: claimed, error: claimError } = await admin
    .from("survey_campaigns")
    .update({ status: "sending", send_started_at: nowIso, error: null })
    .eq("id", campaignId)
    .in("status", ["draft", "failed"])
    .select(COLUMNS)
    .maybeSingle();

  if (claimError) {
    console.error("sendSurveyCampaign claim error", claimError);
    return { status: "skipped", reason: "No se pudo reclamar la encuesta" };
  }

  let campaign = claimed as SurveyCampaignRow | null;

  if (!campaign) {
    const { data: stale } = await admin
      .from("survey_campaigns")
      .update({ status: "sending", send_started_at: nowIso })
      .eq("id", campaignId)
      .eq("status", "sending")
      .lt("send_started_at", staleCutoffIso)
      .select(COLUMNS)
      .maybeSingle();
    campaign = stale as SurveyCampaignRow | null;
  }

  if (!campaign) {
    return { status: "skipped", reason: "La encuesta ya fue enviada o hay un envío en curso" };
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
    return fail(admin, campaignId, err instanceof Error ? err.message : "Error de audiencia");
  }

  if (audience.length === 0) {
    return fail(admin, campaignId, "La audiencia quedó vacía con los filtros elegidos");
  }

  // --- Bitácora ------------------------------------------------------------
  const { data: ledger, error: ledgerError } = await admin
    .from("survey_campaign_recipients")
    .select("student_id")
    .eq("campaign_id", campaignId)
    .eq("channel", "email")
    .eq("status", "sent");

  if (ledgerError) {
    console.error("sendSurveyCampaign ledger read error", ledgerError);
    return fail(admin, campaignId, "No se pudo leer la bitácora de envío");
  }

  const alreadyDelivered = new Set(
    ((ledger ?? []) as Array<{ student_id: string }>).map((r) => r.student_id),
  );
  const missing = audience.filter((r) => !alreadyDelivered.has(r.studentId));

  if (missing.length === 0) {
    await markSent(admin, campaignId, audience.length, alreadyDelivered.size);
    return { status: "sent", sent: 0, alreadySent: alreadyDelivered.size, total: audience.length };
  }

  // --- Despacho ------------------------------------------------------------
  let sentEmails: string[];
  let failures: Array<{ to: string; error: string }>;
  let extraChannels: ExtraChannelRow[];

  try {
    const dispatch =
      campaign.mode === "anonymous"
        ? await dispatchAnonymous(campaign, missing)
        : await dispatchIdentified(campaign, missing);
    ({ sentEmails, failures, extraChannels } = dispatch);
  } catch (err) {
    return fail(admin, campaignId, err instanceof Error ? err.message : "Error al enviar");
  }

  // --- Registro ------------------------------------------------------------
  const byEmail = new Map(missing.map((r) => [r.email, r]));
  const ledgerRows = [
    ...sentEmails.map((to) => ({
      campaign_id: campaignId,
      student_id: byEmail.get(to)!.studentId,
      email: to,
      channel: "email",
      status: "sent",
      error: null as string | null,
    })),
    ...failures.map((f) => ({
      campaign_id: campaignId,
      student_id: byEmail.get(f.to)!.studentId,
      email: f.to,
      channel: "email",
      status: "failed",
      error: f.error,
    })),
    // Lo que hclp reportó por WhatsApp. Va a la bitácora para que quede
    // registro del segundo canal, pero NO cuenta como fallo de la campaña: el
    // correo es el canal primario y que WhatsApp esté apagado es lo normal.
    ...extraChannels.map((r) => ({
      campaign_id: campaignId,
      student_id: byEmail.get(r.email)!.studentId,
      email: r.email,
      channel: r.channel,
      status: r.status,
      error: r.error,
    })),
  ];

  if (ledgerRows.length > 0) {
    const { error: writeError } = await admin
      .from("survey_campaign_recipients")
      .upsert(ledgerRows, { onConflict: "campaign_id,channel,student_id" });
    if (writeError) console.error("sendSurveyCampaign ledger write error", writeError);
  }

  const deliveredTotal = alreadyDelivered.size + sentEmails.length;

  if (failures.length > 0) {
    await admin
      .from("survey_campaigns")
      .update({
        status: "failed",
        recipients_count: audience.length,
        sent_count: deliveredTotal,
        error: `${failures.length} de ${missing.length} envíos fallaron. Reintenta para enviar solo a los que faltan.`,
      })
      .eq("id", campaignId);

    return {
      status: "partial",
      sent: sentEmails.length,
      failed: failures.length,
      alreadySent: alreadyDelivered.size,
      total: audience.length,
    };
  }

  await markSent(admin, campaignId, audience.length, deliveredTotal);
  return {
    status: "sent",
    sent: sentEmails.length,
    alreadySent: alreadyDelivered.size,
    total: audience.length,
  };
}

// --- Caminos de despacho ----------------------------------------------------

/** Resultado de un canal distinto del correo (hoy solo WhatsApp, vía hclp). */
type ExtraChannelRow = {
  email: string;
  channel: string;
  status: "sent" | "failed" | "skipped";
  error: string | null;
};

type DispatchResult = {
  sentEmails: string[];
  failures: Array<{ to: string; error: string }>;
  extraChannels: ExtraChannelRow[];
};

async function dispatchAnonymous(
  campaign: SurveyCampaignRow,
  missing: Array<{ email: string; fullName: string }>,
): Promise<DispatchResult> {
  assertAnonymousUrl(campaign.external_survey_url);
  const brand = getBrandByProgramId(campaign.program_id);

  const messages: BatchMessage[] = missing.map((r) => ({
    to: r.email,
    ...buildSurveyInvitationEmail({
      surveyTitle: campaign.title,
      surveyUrl: campaign.external_survey_url,
      fullName: r.fullName,
      brand,
    }),
  }));

  const outcome = await sendEmailBatch(messages, `sv:${campaign.id}`);
  return { sentEmails: outcome.sent, failures: outcome.failed, extraChannels: [] };
}

async function dispatchIdentified(
  campaign: SurveyCampaignRow,
  missing: Array<{ email: string; fullName: string }>,
): Promise<DispatchResult> {
  const outcome = await enrollRemoteRecipients(
    campaign.external_survey_slug,
    missing.map((r) => ({ email: r.email, name: r.fullName || null })),
  );

  const sentEmails: string[] = [];
  const failures: Array<{ to: string; error: string }> = [];
  const extraChannels: ExtraChannelRow[] = [];

  for (const row of outcome.notified) {
    // 'skipped' es un resultado legítimo de hclp: significa que esa persona ya
    // recibió esta encuesta dentro de la ventana de dedup de 30 días. Cuenta
    // como entregado, no como fallo — reintentar no la volvería a recibir.
    if (row.email_status === "sent" || row.email_status === "skipped") {
      sentEmails.push(row.email);
    } else {
      failures.push({ to: row.email, error: `hclp reportó "${row.email_status}"` });
    }

    // 'disabled' = no se intentó WhatsApp para esa persona; no se registra fila.
    if (row.whatsapp_status !== "disabled") {
      extraChannels.push({
        email: row.email,
        channel: "whatsapp",
        status:
          row.whatsapp_status === "sent"
            ? "sent"
            : row.whatsapp_status === "skipped"
              ? "skipped"
              : "failed",
        error:
          row.whatsapp_status === "sent" || row.whatsapp_status === "skipped"
            ? null
            : `hclp reportó "${row.whatsapp_status}"`,
      });
    }
  }

  return { sentEmails, failures, extraChannels };
}

// --- Helpers de estado ------------------------------------------------------

type AdminClient = ReturnType<typeof createAdminClient>;

async function markSent(
  admin: AdminClient,
  campaignId: string,
  total: number,
  delivered: number,
): Promise<void> {
  await admin
    .from("survey_campaigns")
    .update({
      status: "sent",
      recipients_count: total,
      sent_count: delivered,
      sent_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", campaignId);
}

async function fail(
  admin: AdminClient,
  campaignId: string,
  reason: string,
): Promise<SurveySendResult> {
  await admin
    .from("survey_campaigns")
    .update({ status: "failed", error: reason })
    .eq("id", campaignId);
  return { status: "skipped", reason };
}
