// Correo "grabación disponible": se envía cuando la grabación de una clase en
// vivo (lessons.kind='recorded' enlazada vía class_sessions.lesson_id) queda
// publicada, para CUALQUIER programa excepto CAP-CI (que usa su propio
// seguimiento post-clase en lib/email/capacitacion-emails.ts). Reutiliza el
// shell/estilos de lib/email/deliverable-open.ts.

import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";
import { getPublicBaseUrl } from "@/lib/api/base-url";

const SITE_URL = getPublicBaseUrl();
const PLATFORM_URL = `${SITE_URL}/classroom`;
const BRAND_LOGO_URL = `${SITE_URL}/brand/logo-light.png`;

type SendResult = { ok: boolean; error?: string };

export interface RecordingAvailableInput {
  to: string;
  studentName: string;
  lessonTitle: string;
  programName: string;
  cohortName: string;
  /** Link a la clase dentro del classroom. */
  url: string;
}

export async function sendRecordingAvailableEmail(
  params: RecordingAvailableInput,
): Promise<SendResult> {
  const resend = getResendClient();
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `Ya está disponible la grabación de ${params.lessonTitle}`,
      html: html(params),
      text: text(params),
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

// --- Helpers de formato ------------------------------------------------------

function firstNameOf(fullName: string): string {
  return (fullName || "").split(" ")[0] || "";
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

function html(d: RecordingAvailableInput): string {
  const firstName = firstNameOf(d.studentName);
  const body = `        <tr><td style="padding:32px 32px 8px 32px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#14163a;font-weight:800;">Hola${firstName ? ", " + esc(firstName) : ""} 👋</h1>
          <p style="margin:0 0 4px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Ya está disponible la grabación de tu clase en ${esc(d.programName)}:</p>
        </td></tr>
        <tr><td style="padding:16px 32px 8px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9f9fb;border:1px solid #ededf0;border-radius:12px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0 0 6px 0;font-size:13px;color:#9b9db5;">${esc(d.cohortName)}</p>
              <p style="margin:0;font-size:17px;line-height:1.35;color:#5e17eb;font-weight:800;">${esc(d.lessonTitle)}</p>
            </td></tr>
          </table>
        </td></tr>` +
    "\n" +
    ctaButton(d.url, "Ver la grabación");
  return shell("Grabación disponible", body);
}

function text(d: RecordingAvailableInput): string {
  const firstName = firstNameOf(d.studentName);
  return [
    `Hola${firstName ? ", " + firstName : ""}.`,
    "",
    `Ya está disponible la grabación de tu clase en ${d.programName}:`,
    "",
    `Cohorte: ${d.cohortName}`,
    `Clase: ${d.lessonTitle}`,
    "",
    `Ver la grabación: ${d.url}`,
    "",
    "Capital Academy · capitalacademy.cl/classroom",
  ].join("\n");
}
