import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";
import { getBrandByProgramId } from "@/lib/programs/registry";

export interface AttendanceWarningInput {
  email: string;
  fullName: string;
  programId: string | null;
  cohortName: string | null;
  absencesCount: number;
  maxAbsences: number;
}

/**
 * Correo cordial de seguimiento cuando un alumno acumula inasistencias a
 * clases en vivo. NO es punitivo: invita a retomar. Brandeado por entorno vía
 * `getBrandByProgramId` (mismo patrón de session-reminder.ts, pero con el
 * acento de marca en vez del violet fijo).
 */
export async function sendAttendanceWarningEmail(
  params: AttendanceWarningInput,
): Promise<{ success: boolean; error?: string }> {
  const resend = getResendClient();
  const brand = getBrandByProgramId(params.programId);

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.email,
      subject: subjectFor(brand),
      html: warningHtml(params, brand),
      text: warningText(params, brand),
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

// --- Helpers de presentación -------------------------------------------------

type Brand = ReturnType<typeof getBrandByProgramId>;

function subjectFor(brand: Brand): string {
  return `${brand.shortName}: seguimiento de tu asistencia`;
}

function warningHtml(d: AttendanceWarningInput, brand: Brand): string {
  const firstName = (d.fullName || "").split(" ")[0] || "";
  const cohortRow = d.cohortName
    ? `            <tr>\n              <td style=\"padding:8px 0;font-size:13px;color:#9b9db5;width:130px;vertical-align:top;\">Cohorte</td>\n              <td style=\"padding:8px 0;font-size:14px;color:#14163a;font-weight:600;\">${esc(d.cohortName)}</td>\n            </tr>`
    : "";

  return `<!doctype html>\n<html lang=\"es\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\"></head>\n<body style=\"margin:0;padding:0;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;\">\n  <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f4f4f7;padding:40px 16px;\">\n    <tr><td align=\"center\">\n      <table role=\"presentation\" width=\"600\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);\">\n\n        <!-- Header -->\n        <tr><td style=\"padding:0;background:#14163a;\">\n          <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\">\n            <tr><td align=\"center\" style=\"padding:32px 28px;\">\n              <img src=\"https://capitalacademy.cl/brand/logo-light.png\" alt=\"${esc(brand.shortName)}\" width=\"200\" style=\"display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;\" />\n              <p style=\"margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;\">${esc(brand.eyebrow)}</p>\n            </td></tr>\n          </table>\n        </td></tr>\n\n        <!-- Body -->\n        <tr><td style=\"padding:32px 32px 8px 32px;\">\n          <h1 style=\"margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#14163a;font-weight:800;\">Hola${firstName ? ", " + esc(firstName) : ""} 👋</h1>\n          <p style=\"margin:0 0 4px 0;font-size:15px;line-height:1.65;color:#3a3d5c;\">Notamos que te has perdido algunas clases en vivo y queremos ayudarte a retomar el ritmo.</p>\n        </td></tr>\n\n        <!-- Tarjeta de asistencia -->\n        <tr><td style=\"padding:16px 32px 8px 32px;\">\n          <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f9f9fb;border:1px solid #ededf0;border-radius:12px;\">\n            <tr><td style=\"padding:20px 22px;\">\n              <p style=\"margin:0 0 14px 0;font-size:17px;line-height:1.35;color:${brand.accent};font-weight:800;\">Registramos ${d.absencesCount} inasistencias</p>\n              <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\">\n${cohortRow}\n                <tr>\n                  <td style=\"padding:8px 0;font-size:13px;color:#9b9db5;width:130px;vertical-align:top;\">Máximo permitido</td>\n                  <td style=\"padding:8px 0;font-size:14px;color:#14163a;font-weight:600;\">${d.maxAbsences} inasistencias</td>\n                </tr>\n              </table>\n            </td></tr>\n          </table>\n        </td></tr>\n\n        <!-- CTA -->\n        <tr><td align=\"center\" style=\"padding:8px 32px 28px 32px;\">\n          <a href=\"https://capitalacademy.cl/classroom\" target=\"_blank\" style=\"display:inline-block;padding:14px 40px;background:${brand.accent};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;\">Ir a mi classroom</a>\n        </td></tr>\n\n        <!-- Nota -->\n        <tr><td style=\"padding:0 32px 24px 32px;\">\n          <p style=\"margin:0;font-size:13px;line-height:1.6;color:#6b6e8a;\">Si tuviste algún inconveniente para asistir, revisa tu calendario en la plataforma para ver las próximas clases y ponerte al día.</p>\n        </td></tr>\n\n        <!-- Footer -->\n        <tr><td style=\"padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;\">\n          <p style=\"margin:0;font-size:12px;color:#9b9db5;text-align:center;\">${esc(brand.shortName)} &middot; <a href=\"https://capitalacademy.cl/classroom\" style=\"color:${brand.accent};text-decoration:none;\">Ir a la plataforma</a></p>\n        </td></tr>\n\n      </table>\n    </td></tr>\n  </table>\n</body></html>`;
}

function warningText(d: AttendanceWarningInput, brand: Brand): string {
  const firstName = (d.fullName || "").split(" ")[0] || "";
  const lines = [
    `Hola${firstName ? ", " + firstName : ""}.`,
    "",
    "Notamos que te has perdido algunas clases en vivo y queremos ayudarte a retomar el ritmo.",
    "",
    `Registramos ${d.absencesCount} inasistencias.`,
  ];
  if (d.cohortName) lines.push(`Cohorte: ${d.cohortName}`);
  lines.push(`Máximo permitido: ${d.maxAbsences} inasistencias`);
  lines.push(
    "",
    "Si tuviste algún inconveniente para asistir, revisa tu calendario en la plataforma para ver las próximas clases y ponerte al día.",
    "",
    `${brand.shortName} · capitalacademy.cl/classroom`,
  );
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
