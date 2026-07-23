import type { EmailContent } from "@/lib/email/send-batch";

const TZ = "America/Santiago";

export interface SessionReminderInput {
  email: string;
  fullName: string;
  sessionTitle: string;
  startsAtIso: string;
  endsAtIso: string;
  // 'live_in_person' | 'live_online' | 'recorded' (enum lesson_kind)
  modality: string;
  meetingUrl: string | null;
  teacherName: string | null;
  // '24h' | '1h' — define el encabezado de urgencia del correo.
  kind: "24h" | "1h";
}

/**
 * Arma el recordatorio genérico sin enviarlo: el cron lo despacha por lote
 * (lib/email/send-batch.ts). Ver ADR-0020.
 */
export function buildSessionReminderEmail(params: SessionReminderInput): EmailContent {
  return {
    subject: subjectFor(params),
    html: reminderHtml(params),
    text: reminderText(params),
  };
}

// --- Helpers de presentación -------------------------------------------------

function subjectFor(d: SessionReminderInput): string {
  const when = d.kind === "1h" ? "Hoy" : "Mañana";
  return `Recordatorio: ${when} tienes ${d.sessionTitle}`;
}

function modalityLabel(modality: string): string {
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

function isOnline(modality: string): boolean {
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

function antelacionLabel(kind: "24h" | "1h"): string {
  return kind === "1h"
    ? "Tu clase comienza en aproximadamente 1 hora."
    : "Tu clase es mañana. Te dejamos los detalles para que la agendes.";
}

function reminderHtml(d: SessionReminderInput): string {
  const firstName = (d.fullName || "").trim().split(" ")[0] || "";
  const online = isOnline(d.modality);
  const dateLabel = fmtDate(d.startsAtIso);
  const timeLabel = `${fmtTime(d.startsAtIso)} – ${fmtTime(d.endsAtIso)} hrs (Chile)`;
  const modLabel = modalityLabel(d.modality);

  const ctaRow =
    online && d.meetingUrl
      ? `        <!-- CTA -->\n        <tr><td align=\"center\" style=\"padding:8px 32px 28px 32px;\">\n          <a href=\"${esc(d.meetingUrl)}\" target=\"_blank\" style=\"display:inline-block;padding:14px 40px;background:#5e17eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;\">Unirme a la clase</a>\n        </td></tr>`
      : "";

  const teacherRow = d.teacherName
    ? `            <tr>\n              <td style=\"padding:8px 0;font-size:13px;color:#9b9db5;width:130px;vertical-align:top;\">Docente</td>\n              <td style=\"padding:8px 0;font-size:14px;color:#14163a;font-weight:600;\">${esc(d.teacherName)}</td>\n            </tr>`
    : "";

  return `<!doctype html>\n<html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\"></head>\n<body style=\"margin:0;padding:0;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;\">\n  <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f4f4f7;padding:40px 16px;\">\n    <tr><td align=\"center\">\n      <table role=\"presentation\" width=\"600\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);\">\n\n        <!-- Header -->\n        <tr><td style=\"padding:0;background:#14163a;\">\n          <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\">\n            <tr><td align=\"center\" style=\"padding:32px 28px;\">\n              <img src=\"https://capitalacademy.cl/brand/logo-light.png\" alt=\"Capital Academy\" width=\"200\" style=\"display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;\" />\n              <p style=\"margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;\">Recordatorio de clase</p>\n            </td></tr>\n          </table>\n        </td></tr>\n\n        <!-- Body -->\n        <tr><td style=\"padding:32px 32px 8px 32px;\">\n          <h1 style=\"margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#14163a;font-weight:800;\">Hola${firstName ? ", " + esc(firstName) : ""} 👋</h1>\n          <p style=\"margin:0 0 4px 0;font-size:15px;line-height:1.65;color:#3a3d5c;\">${esc(antelacionLabel(d.kind))}</p>\n        </td></tr>\n\n        <!-- Tarjeta de la sesión -->\n        <tr><td style=\"padding:16px 32px 8px 32px;\">\n          <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f9f9fb;border:1px solid #ededf0;border-radius:12px;\">\n            <tr><td style=\"padding:20px 22px;\">\n              <p style=\"margin:0 0 14px 0;font-size:17px;line-height:1.35;color:#5e17eb;font-weight:800;\">${esc(d.sessionTitle)}</p>\n              <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\">\n                <tr>\n                  <td style=\"padding:8px 0;font-size:13px;color:#9b9db5;width:130px;vertical-align:top;\">Fecha</td>\n                  <td style=\"padding:8px 0;font-size:14px;color:#14163a;font-weight:600;text-transform:capitalize;\">${esc(dateLabel)}</td>\n                </tr>\n                <tr>\n                  <td style=\"padding:8px 0;font-size:13px;color:#9b9db5;vertical-align:top;\">Horario</td>\n                  <td style=\"padding:8px 0;font-size:14px;color:#14163a;font-weight:600;\">${esc(timeLabel)}</td>\n                </tr>\n                <tr>\n                  <td style=\"padding:8px 0;font-size:13px;color:#9b9db5;vertical-align:top;\">Modalidad</td>\n                  <td style=\"padding:8px 0;font-size:14px;color:#14163a;font-weight:600;\">${esc(modLabel)}</td>\n                </tr>\n${teacherRow}\n              </table>\n            </td></tr>\n          </table>\n        </td></tr>\n\n${ctaRow}\n\n        <!-- Nota -->\n        <tr><td style=\"padding:${ctaRow ? "0" : "16px"} 32px 24px 32px;\">\n          <p style=\"margin:0;font-size:13px;line-height:1.6;color:#6b6e8a;\">${
            online
              ? d.meetingUrl
                ? "El botón te lleva directo a la sala. Conéctate unos minutos antes."
                : "Esta clase es online. El enlace de conexión estará disponible en tu calendario dentro de la plataforma."
              : "Esta clase es presencial. Revisa la ubicación y los materiales en tu calendario dentro de la plataforma."
          }</p>\n        </td></tr>\n\n        <!-- Footer -->\n        <tr><td style=\"padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;\">\n          <p style=\"margin:0;font-size:12px;color:#9b9db5;text-align:center;\">Capital Academy &middot; <a href=\"https://capitalacademy.cl/classroom\" style=\"color:#5e17eb;text-decoration:none;\">Ir a la plataforma</a></p>\n        </td></tr>\n\n      </table>\n    </td></tr>\n  </table>\n</body></html>`;
}

function reminderText(d: SessionReminderInput): string {
  const firstName = (d.fullName || "").trim().split(" ")[0] || "";
  const online = isOnline(d.modality);
  const lines = [
    `Hola${firstName ? ", " + firstName : ""}.`,
    "",
    antelacionLabel(d.kind),
    "",
    `Clase: ${d.sessionTitle}`,
    `Fecha: ${fmtDate(d.startsAtIso)}`,
    `Horario: ${fmtTime(d.startsAtIso)} – ${fmtTime(d.endsAtIso)} hrs (Chile)`,
    `Modalidad: ${modalityLabel(d.modality)}`,
  ];
  if (d.teacherName) lines.push(`Docente: ${d.teacherName}`);
  lines.push("");
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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
