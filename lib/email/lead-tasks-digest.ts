/**
 * Recordatorio diario del seguimiento de leads (ADR-0038).
 *
 * Sale una vez al día, temprano, con lo que está atrasado y lo que vence hoy —
 * y SOLO si hay algo: un correo diario que a veces dice "no tienes nada" deja
 * de leerse en una semana, y entonces tampoco se lee el día que sí importaba.
 *
 * Va a quien creó la tarea, no a una casilla compartida: la persona que se
 * comprometió a llamar es la que tiene que acordarse.
 */

import { escapeHtml } from "@/lib/email/markdown";
import {
  emailShell,
  emailSection,
  emailButton,
  emailGreeting,
  EMAIL_COLORS,
  SITE_URL,
} from "@/lib/email/layout";
import { TZ_CHILE } from "@/lib/time";
import type { EmailContent } from "@/lib/email/send-batch";
import type { DigestRecipient, DigestTask } from "@/lib/admin/leads-queries";

const PANEL_URL = `${SITE_URL}/admin/leads`;

const horaFormatter = new Intl.DateTimeFormat("es-CL", {
  timeZone: TZ_CHILE,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function cuando(task: DigestTask): string {
  const d = new Date(task.due_at);
  if (Number.isNaN(d.getTime())) return "sin fecha";
  return horaFormatter.format(d).replace(",", "");
}

/**
 * El asunto lleva el conteo y, si hay atrasadas, las nombra.
 *
 * Es lo único que se ve sin abrir: "3 pendientes (1 atrasada)" permite decidir
 * si abrirlo ahora o después, cosa que "Tus tareas de hoy" no permite.
 */
export function digestSubject(tasks: DigestTask[]): string {
  const vencidas = tasks.filter((t) => t.urgency === "vencida").length;
  const total = tasks.length;
  const base = `${total} ${total === 1 ? "seguimiento pendiente" : "seguimientos pendientes"}`;
  if (vencidas === 0) return `Leads · ${base}`;
  return `Leads · ${base} (${vencidas} ${vencidas === 1 ? "atrasado" : "atrasados"})`;
}

function filaHtml(task: DigestTask): string {
  const atrasada = task.urgency === "vencida";
  const etiqueta = atrasada
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#fdecec;color:#b3261e;font-size:11px;font-weight:700;">Atrasada</span>`
    : `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${EMAIL_COLORS.card};color:${EMAIL_COLORS.muted};font-size:11px;font-weight:700;">Hoy</span>`;

  return `            <tr><td style="padding:12px 0;border-bottom:1px solid ${EMAIL_COLORS.border};">
              <p style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:${EMAIL_COLORS.ink};">${escapeHtml(task.title)}</p>
              <p style="margin:0;font-size:13px;color:${EMAIL_COLORS.muted};">${escapeHtml(task.lead_name)} &middot; ${escapeHtml(cuando(task))} &nbsp;${etiqueta}</p>
            </td></tr>`;
}

function html(recipient: DigestRecipient): string {
  const filas = recipient.tasks.map(filaHtml).join("\n");

  return emailShell({
    eyebrow: "Seguimiento de leads",
    preheader: digestSubject(recipient.tasks),
    bodyInner: `${emailSection(
      `          ${emailGreeting(recipient.full_name)}
          <p style="margin:0 0 4px 0;font-size:15px;line-height:1.6;color:${EMAIL_COLORS.ink};">Esto es lo que tienes agendado:</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:12px;">
${filas}
          </table>`,
    )}
${emailButton(PANEL_URL, "Abrir el panel de leads", "#5e17eb")}`,
    footerNote:
      "Recibes este correo porque agendaste estos seguimientos en el panel de leads.",
  });
}

function text(recipient: DigestRecipient): string {
  const lineas = recipient.tasks.map(
    (t) =>
      `- ${t.title} — ${t.lead_name} (${cuando(t)})${t.urgency === "vencida" ? " [ATRASADA]" : ""}`,
  );

  return [
    `Hola${recipient.full_name ? ` ${recipient.full_name.split(" ")[0]}` : ""},`,
    "",
    "Esto es lo que tienes agendado:",
    "",
    ...lineas,
    "",
    `Abrir el panel: ${PANEL_URL}`,
  ].join("\n");
}

export function buildLeadTasksDigest(recipient: DigestRecipient): EmailContent {
  return {
    subject: digestSubject(recipient.tasks),
    html: html(recipient),
    text: text(recipient),
  };
}
