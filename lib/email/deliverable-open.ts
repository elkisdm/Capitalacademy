// Correo de apertura de un entregable: se envía cuando la ventana de subida
// queda abierta (al crearlo si opens_at ya pasó, o vía el cron de aperturas
// futuras). Reutiliza el shell/estilos de lib/email/capacitacion-emails.ts.

import { getPublicBaseUrl } from "@/lib/api/base-url";
import type { EmailContent } from "@/lib/email/send-batch";

const TZ = "America/Santiago";
const SITE_URL = getPublicBaseUrl();
const PLATFORM_URL = `${SITE_URL}/classroom`;
const BRAND_LOGO_URL = `${SITE_URL}/brand/logo-light.png`;
const DEFAULT_PROGRAM_NAME = "Capital Academy";

export interface DeliverableOpenInput {
  email: string;
  fullName: string;
  deliverableTitle: string;
  dueAtIso: string;
  programName?: string;
  /** Link a la plataforma. Por defecto: ${SITE_URL}/classroom. */
  url?: string;
}

export function buildDeliverableOpenEmail(params: DeliverableOpenInput): EmailContent {
  const program = params.programName || DEFAULT_PROGRAM_NAME;
  const url = params.url || PLATFORM_URL;
  return {
    subject: `Ya puedes subir: ${params.deliverableTitle}`,
    html: html(params, program, url),
    text: text(params, program, url),
  };
}

// --- Helpers de formato ------------------------------------------------------

function firstNameOf(fullName: string): string {
  return (fullName || "").split(" ")[0] || "";
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- Cuerpo --------------------------------------------------------------

function shell(eyebrow: string, bodyInner: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);">

        <!-- Header -->
        <tr><td style="padding:0;background:#14163a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr><td align="center" style="padding:32px 28px;">
              <img src="${BRAND_LOGO_URL}" alt="Capital Academy" width="200" style="display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;" />
              <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;">${esc(eyebrow)}</p>
            </td></tr>
          </table>
        </td></tr>

${bodyInner}

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;">
          <p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="${PLATFORM_URL}" style="color:#5e17eb;text-decoration:none;">Ir a la plataforma</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

function ctaButton(url: string, label: string): string {
  return `        <!-- CTA -->
        <tr><td align="center" style="padding:24px 32px 28px 32px;">
          <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:14px 40px;background:#5e17eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">${esc(label)}</a>
        </td></tr>`;
}

function html(d: DeliverableOpenInput, program: string, url: string): string {
  const firstName = firstNameOf(d.fullName);
  const body = `        <tr><td style="padding:32px 32px 8px 32px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#14163a;font-weight:800;">Hola${firstName ? ", " + esc(firstName) : ""} 👋</h1>
          <p style="margin:0 0 4px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Ya está abierta la ventana para subir tu entrega en ${esc(program)}:</p>
        </td></tr>
        <tr><td style="padding:16px 32px 8px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9f9fb;border:1px solid #ededf0;border-radius:12px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0 0 14px 0;font-size:17px;line-height:1.35;color:#5e17eb;font-weight:800;">${esc(d.deliverableTitle)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#9b9db5;width:130px;vertical-align:top;">Fecha límite</td>
                  <td style="padding:8px 0;font-size:14px;color:#14163a;font-weight:600;text-transform:capitalize;">${esc(fmtDate(d.dueAtIso))} (Chile)</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>` +
    "\n" +
    ctaButton(url, "Subir mi entrega");
  return shell("Entregable disponible", body);
}

function text(d: DeliverableOpenInput, program: string, url: string): string {
  const firstName = firstNameOf(d.fullName);
  return [
    `Hola${firstName ? ", " + firstName : ""}.`,
    "",
    `Ya está abierta la ventana para subir tu entrega en ${program}:`,
    "",
    `Entregable: ${d.deliverableTitle}`,
    `Fecha límite: ${fmtDate(d.dueAtIso)} (Chile)`,
    "",
    `Subir mi entrega: ${url}`,
    "",
    "Capital Academy · capitalacademy.cl/classroom",
  ].join("\n");
}
