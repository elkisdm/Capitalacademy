// Secuencia de correos para el Ciclo de Capacitaciones Comerciales.
//
// Contexto (reunión 1 jul 2026): el ciclo es un entorno de captación (cupo máx
// 40). Las capacitaciones son gratuitas y actúan como valor agregado para atraer
// interesados y transicionarlos hacia los programas pagos. Cada sesión del ciclo
// dispara una secuencia:
//   1. Confirmación de inscripción a una sesión  (al registrarse)
//   2. Recordatorio 24h antes                     (cron, ventana '24h')
//   3. Recordatorio 1h antes / el día de          (cron, ventana '1h')
//   4. Seguimiento post-clase                     (grabación disponible + CTA pago)
//
// Todo se envía con Resend (transaccional), igual que el resto de `lib/email/`.
// Brevo se usa SOLO para campañas masivas; esta secuencia NO usa Brevo.
//
// --- Cómo se disparan (NO cableado aquí, ver "Decisiones abiertas") ----------
//
// - Confirmación (1): transaccional, al procesar el formulario de inscripción a
//   la sesión. Se llama directo desde el route handler / server action que crea
//   la inscripción, igual que `sendPaymentConfirmationEmail` en el flujo de pago.
//
// - Recordatorios 24h/1h (2 y 3): YA existe infraestructura de cron para esto en
//   `app/api/cron/session-reminders/route.ts` + la Netlify Scheduled Function
//   `netlify/functions/session-reminders-cron.mjs` (corre cada 30 min, consulta
//   `class_sessions` en las ventanas 24h/1h y garantiza idempotencia vía la tabla
//   `session_reminders`). Ese cron hoy usa `sendSessionReminderEmail`. Para el
//   ciclo de capacitación se puede: (a) reutilizar ese cron tal cual si los
//   recordatorios genéricos bastan, o (b) enrutar por entorno/programa para usar
//   `sendCapacitacionReminderEmail` (voz de captación + CTA), decidiendo según el
//   `cohort`/`program` de la sesión. NO se modifica el cron aquí para no tocar el
//   entorno nuevo, que otro proceso está construyendo en paralelo.
//
// - Seguimiento post-clase (4): se dispara cuando la grabación queda publicada en
//   la plataforma (webhook de Mux al terminar el procesado, o un paso manual tras
//   subir el video). Se envía a los inscritos de la sesión.

import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";
import { getPublicBaseUrl } from "@/lib/api/base-url";

const TZ = "America/Santiago";
// URL base resuelta por entorno de deploy (dev/preview/prod), no hardcodeada.
const SITE_URL = getPublicBaseUrl();
const PLATFORM_URL = `${SITE_URL}/classroom`;
const BRAND_LOGO_URL = `${SITE_URL}/brand/logo-light.png`;

// Marca neutra por defecto. La marca real del programa se pasa por parámetro
// (`programName`) para NO asumir "Diplomado" ni ningún programa concreto: el
// ciclo de capacitación es su propio entorno. Sigue el criterio de
// `resolveProgram` en payment-confirmation.ts (fallback neutro = Capital Academy).
const DEFAULT_PROGRAM_NAME = "Capital Academy";

type SendResult = { success: boolean; error?: string };

// Modalidad = enum lesson_kind: 'live_in_person' | 'live_online' | 'recorded'.
type Modality = string;

// --- API pública -------------------------------------------------------------

export interface CapacitacionConfirmationInput {
  email: string;
  fullName: string;
  sessionTitle: string;
  startsAtIso: string;
  endsAtIso: string;
  modality: Modality;
  meetingUrl: string | null;
  /** Nombre del programa/ciclo para la marca del correo. */
  programName?: string;
}

/** (1) Confirmación de inscripción a una sesión del ciclo. */
export async function sendCapacitacionConfirmationEmail(
  params: CapacitacionConfirmationInput,
): Promise<SendResult> {
  const program = params.programName || DEFAULT_PROGRAM_NAME;
  return send({
    to: params.email,
    subject: `Inscripción confirmada · ${params.sessionTitle}`,
    html: confirmationHtml(params, program),
    text: confirmationText(params, program),
  });
}

export interface CapacitacionReminderInput {
  email: string;
  fullName: string;
  sessionTitle: string;
  startsAtIso: string;
  endsAtIso: string;
  modality: Modality;
  meetingUrl: string | null;
  /** '24h' | '1h' — define la urgencia del encabezado. */
  kind: "24h" | "1h";
}

/** (2 y 3) Recordatorio 24h / 1h antes de la sesión. */
export async function sendCapacitacionReminderEmail(
  params: CapacitacionReminderInput,
): Promise<SendResult> {
  const when = params.kind === "1h" ? "Hoy" : "Mañana";
  return send({
    to: params.email,
    subject: `Recordatorio: ${when} tienes ${params.sessionTitle}`,
    html: reminderHtml(params),
    text: reminderText(params),
  });
}

export interface CapacitacionFollowupInput {
  email: string;
  fullName: string;
  sessionTitle: string;
  /** Link a la grabación dentro de la plataforma. */
  recordingUrl: string;
  /** CTA hacia el programa pago (checkout / landing del programa). */
  programCtaUrl: string;
  /** Texto del botón hacia el programa pago. Ej: "Conoce el Diplomado". */
  programCtaLabel: string;
  programName?: string;
}

/** (4) Seguimiento post-clase: grabación disponible + CTA a programa pago. */
export async function sendCapacitacionFollowupEmail(
  params: CapacitacionFollowupInput,
): Promise<SendResult> {
  const program = params.programName || DEFAULT_PROGRAM_NAME;
  return send({
    to: params.email,
    subject: `Ya está disponible la grabación de ${params.sessionTitle}`,
    html: followupHtml(params, program),
    text: followupText(params, program),
  });
}

// --- Envío -------------------------------------------------------------------

async function send(msg: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const resend = getResendClient();
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

// --- Helpers de formato ------------------------------------------------------

function firstNameOf(fullName: string): string {
  return (fullName || "").split(" ")[0] || "";
}

function modalityLabel(modality: Modality): string {
  switch (modality) {
    case "live_in_person":
      return "Presencial";
    case "live_online":
      return "Online (en vivo)";
    case "recorded":
      return "Grabada";
    default:
      return modality;
  }
}

function isOnline(modality: Modality): boolean {
  return modality === "live_online";
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(iso));
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function timeRange(startIso: string, endIso: string): string {
  return `${fmtTime(startIso)} – ${fmtTime(endIso)} hrs (Chile)`;
}

// --- Bloques HTML compartidos ------------------------------------------------

// Shell común: replica el layout del classroom (session-reminder.ts,
// conversacion-notification.ts): fondo #f4f4f7, header #14163a con logo y
// eyebrow lima, cuerpo blanco, footer con link a la plataforma.
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

function greeting(firstName: string, lead: string): string {
  return `        <!-- Body -->
        <tr><td style="padding:32px 32px 8px 32px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#14163a;font-weight:800;">Hola${firstName ? ", " + esc(firstName) : ""} 👋</h1>
          <p style="margin:0 0 4px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">${esc(lead)}</p>
        </td></tr>`;
}

// Tarjeta de la sesión con fecha, horario y modalidad.
function sessionCard(input: {
  sessionTitle: string;
  startsAtIso: string;
  endsAtIso: string;
  modality: Modality;
}): string {
  return `        <!-- Tarjeta de la sesión -->
        <tr><td style="padding:16px 32px 8px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9f9fb;border:1px solid #ededf0;border-radius:12px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0 0 14px 0;font-size:17px;line-height:1.35;color:#5e17eb;font-weight:800;">${esc(input.sessionTitle)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#9b9db5;width:130px;vertical-align:top;">Fecha</td>
                  <td style="padding:8px 0;font-size:14px;color:#14163a;font-weight:600;text-transform:capitalize;">${esc(fmtDate(input.startsAtIso))}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#9b9db5;vertical-align:top;">Horario</td>
                  <td style="padding:8px 0;font-size:14px;color:#14163a;font-weight:600;">${esc(timeRange(input.startsAtIso, input.endsAtIso))}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#9b9db5;vertical-align:top;">Modalidad</td>
                  <td style="padding:8px 0;font-size:14px;color:#14163a;font-weight:600;">${esc(modalityLabel(input.modality))}</td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>`;
}

function ctaButton(url: string, label: string): string {
  return `        <!-- CTA -->
        <tr><td align="center" style="padding:24px 32px 28px 32px;">
          <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:14px 40px;background:#5e17eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">${esc(label)}</a>
        </td></tr>`;
}

function note(html: string): string {
  return `        <!-- Nota -->
        <tr><td style="padding:0 32px 24px 32px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#6b6e8a;">${html}</p>
        </td></tr>`;
}

// --- (1) Confirmación --------------------------------------------------------

function confirmationHtml(d: CapacitacionConfirmationInput, program: string): string {
  const firstName = firstNameOf(d.fullName);
  const online = isOnline(d.modality);
  const cta = online && d.meetingUrl ? ctaButton(d.meetingUrl, "Guardar el enlace de la clase") : "";
  const body =
    greeting(
      firstName,
      `Tu cupo en ${program} quedó confirmado. Te esperamos en esta capacitación:`,
    ) +
    "\n" +
    sessionCard(d) +
    "\n" +
    cta +
    "\n" +
    note(
      online
        ? d.meetingUrl
          ? "El enlace de conexión es el mismo botón de arriba. Te enviaremos recordatorios antes de la clase."
          : "Esta clase es online. Te enviaremos el enlace de conexión en los recordatorios previos."
        : "Esta clase es presencial. Revisa la ubicación en tu calendario dentro de la plataforma. Te enviaremos recordatorios antes de la clase.",
    );
  return shell("Inscripción confirmada", body);
}

function confirmationText(d: CapacitacionConfirmationInput, program: string): string {
  const firstName = firstNameOf(d.fullName);
  const online = isOnline(d.modality);
  const lines = [
    `Hola${firstName ? ", " + firstName : ""}.`,
    "",
    `Tu cupo en ${program} quedó confirmado. Te esperamos en esta capacitación:`,
    "",
    `Clase: ${d.sessionTitle}`,
    `Fecha: ${fmtDate(d.startsAtIso)}`,
    `Horario: ${timeRange(d.startsAtIso, d.endsAtIso)}`,
    `Modalidad: ${modalityLabel(d.modality)}`,
    "",
  ];
  if (online && d.meetingUrl) {
    lines.push(`Enlace de conexión: ${d.meetingUrl}`);
  } else if (online) {
    lines.push("Te enviaremos el enlace de conexión en los recordatorios previos.");
  } else {
    lines.push("Clase presencial. Revisa la ubicación en tu calendario dentro de la plataforma.");
  }
  lines.push("", "Capital Academy · capitalacademy.cl/classroom");
  return lines.join("\n");
}

// --- (2 y 3) Recordatorio 24h / 1h ------------------------------------------

function antelacionLead(kind: "24h" | "1h"): string {
  return kind === "1h"
    ? "Tu capacitación comienza en aproximadamente 1 hora."
    : "Tu capacitación es mañana. Te dejamos los detalles para que la agendes.";
}

function reminderHtml(d: CapacitacionReminderInput): string {
  const firstName = firstNameOf(d.fullName);
  const online = isOnline(d.modality);
  const cta = online && d.meetingUrl ? ctaButton(d.meetingUrl, "Unirme a la clase") : "";
  const body =
    greeting(firstName, antelacionLead(d.kind)) +
    "\n" +
    sessionCard(d) +
    "\n" +
    cta +
    "\n" +
    note(
      online
        ? d.meetingUrl
          ? "El botón te lleva directo a la sala. Conéctate unos minutos antes."
          : "Esta clase es online. El enlace de conexión estará disponible en tu calendario dentro de la plataforma."
        : "Esta clase es presencial. Revisa la ubicación y los materiales en tu calendario dentro de la plataforma.",
    );
  return shell("Recordatorio de clase", body);
}

function reminderText(d: CapacitacionReminderInput): string {
  const firstName = firstNameOf(d.fullName);
  const online = isOnline(d.modality);
  const lines = [
    `Hola${firstName ? ", " + firstName : ""}.`,
    "",
    antelacionLead(d.kind),
    "",
    `Clase: ${d.sessionTitle}`,
    `Fecha: ${fmtDate(d.startsAtIso)}`,
    `Horario: ${timeRange(d.startsAtIso, d.endsAtIso)}`,
    `Modalidad: ${modalityLabel(d.modality)}`,
    "",
  ];
  if (online && d.meetingUrl) {
    lines.push(`Enlace de conexión: ${d.meetingUrl}`);
  } else if (online) {
    lines.push("El enlace de conexión estará disponible en tu calendario dentro de la plataforma.");
  } else {
    lines.push("Clase presencial. Revisa la ubicación y materiales en tu calendario dentro de la plataforma.");
  }
  lines.push("", "Capital Academy · capitalacademy.cl/classroom");
  return lines.join("\n");
}

// --- (4) Seguimiento post-clase ---------------------------------------------

function followupHtml(d: CapacitacionFollowupInput, program: string): string {
  const firstName = firstNameOf(d.fullName);
  const recordingCard = `        <!-- Tarjeta grabación -->
        <tr><td style="padding:16px 32px 8px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9f9fb;border:1px solid #ededf0;border-radius:12px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0 0 6px 0;font-size:13px;color:#9b9db5;">Grabación disponible</p>
              <p style="margin:0;font-size:17px;line-height:1.35;color:#5e17eb;font-weight:800;">${esc(d.sessionTitle)}</p>
            </td></tr>
          </table>
        </td></tr>`;
  const ctaProgram = `        <!-- CTA programa pago -->
        <tr><td align="center" style="padding:8px 32px 6px 32px;">
          <a href="${esc(d.programCtaUrl)}" target="_blank" style="display:inline-block;padding:14px 40px;background:#5e17eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">${esc(d.programCtaLabel)}</a>
        </td></tr>`;
  const body =
    greeting(
      firstName,
      `Gracias por acompañarnos. Ya puedes volver a ver la clase cuando quieras desde la plataforma.`,
    ) +
    "\n" +
    recordingCard +
    "\n" +
    ctaButton(d.recordingUrl, "Ver la grabación") +
    "\n" +
    note(
      `¿Quieres profundizar? ${esc(program)} es el siguiente paso para llevar lo aprendido a otro nivel.`,
    ) +
    "\n" +
    ctaProgram;
  return shell("Grabación disponible", body);
}

function followupText(d: CapacitacionFollowupInput, program: string): string {
  const firstName = firstNameOf(d.fullName);
  return [
    `Hola${firstName ? ", " + firstName : ""}.`,
    "",
    "Gracias por acompañarnos. Ya puedes volver a ver la clase cuando quieras desde la plataforma.",
    "",
    `Clase: ${d.sessionTitle}`,
    `Ver la grabación: ${d.recordingUrl}`,
    "",
    `¿Quieres profundizar? ${program} es el siguiente paso.`,
    `${d.programCtaLabel}: ${d.programCtaUrl}`,
    "",
    "Capital Academy · capitalacademy.cl/classroom",
  ].join("\n");
}

// --- Utilidad ----------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
