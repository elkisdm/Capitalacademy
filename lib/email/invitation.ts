import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";

interface InvitationEmailInput {
  email: string;
  fullName: string;
  inviteUrl: string;
  programName: string;
  cohortName: string;
}

export async function sendInvitationEmail(
  params: InvitationEmailInput,
): Promise<{ success: boolean; error?: string }> {
  const resend = getResendClient();

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.email,
      subject: `Bienvenido a Capital Academy — ${params.programName}`,
      html: invitationHtml(params),
      text: invitationText(params),
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

function invitationHtml(d: InvitationEmailInput): string {
  const firstName = d.fullName.split(" ")[0];

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
              <img src="https://capitalacademy.cl/brand/logo-light.png" alt="Capital Academy" width="200" style="display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;" />
              <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;">Plataforma educativa</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 32px 16px 32px;">
          <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;color:#14163a;font-weight:800;">&iexcl;Bienvenido a Capital Academy, ${esc(firstName)}!</h1>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Has sido inscrito en <strong style="color:#5e17eb;">${esc(courseLabel(d.programName, d.cohortName))}</strong>.</p>
        </td></tr>

        <!-- CTA -->
        <tr><td align="center" style="padding:0 32px 28px 32px;">
          <a href="${esc(d.inviteUrl)}" target="_blank" style="display:inline-block;padding:14px 40px;background:#5e17eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">Crear mi contrase&ntilde;a</a>
        </td></tr>

        <!-- Note -->
        <tr><td style="padding:0 32px 24px 32px;">
          <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#6b6e8a;">El enlace expira en 72 horas. Al hacer click, crear&aacute;s tu contrase&ntilde;a y completar&aacute;s tu perfil.</p>
        </td></tr>

        <!-- Steps -->
        <tr><td style="padding:0 32px 32px 32px;">
          <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">&iquest;Qu&eacute; viene despu&eacute;s?</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;color:#3a3d5c;">
            <tr>
              <td style="padding:4px 12px 4px 0;color:#5e17eb;font-weight:800;vertical-align:top;width:24px;">1.</td>
              <td style="padding:4px 0;"><strong>Crea tu contrase&ntilde;a</strong> <span style="color:#9b9db5;">(1 min)</span></td>
            </tr>
            <tr>
              <td style="padding:4px 12px 4px 0;color:#5e17eb;font-weight:800;vertical-align:top;">2.</td>
              <td style="padding:4px 0;"><strong>Completa tu perfil</strong> (RUT, tel&eacute;fono) <span style="color:#9b9db5;">(2 min)</span></td>
            </tr>
            <tr>
              <td style="padding:4px 12px 4px 0;color:#5e17eb;font-weight:800;vertical-align:top;">3.</td>
              <td style="padding:4px 0;"><strong>Revisa tu calendario y te esperamos en tu primera clase</strong></td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;">
          <p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="https://capitalacademy.cl" style="color:#5e17eb;text-decoration:none;">capitalacademy.cl</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

function invitationText(d: InvitationEmailInput): string {
  const firstName = d.fullName.split(" ")[0];

  return [
    `¡Bienvenido a Capital Academy, ${firstName}!`,
    "",
    `Has sido inscrito en ${courseLabel(d.programName, d.cohortName)}.`,
    "",
    `Crea tu contraseña: ${d.inviteUrl}`,
    "",
    "El enlace expira en 72 horas. Al hacer click, crearás tu contraseña y completarás tu perfil.",
    "",
    "¿Qué viene después?",
    "  1. Crea tu contraseña (1 min)",
    "  2. Completa tu perfil — RUT, teléfono (2 min)",
    "  3. Revisa tu calendario y te esperamos en tu primera clase",
    "",
    "Capital Academy · capitalacademy.cl",
  ].join("\n");
}

// Evita duplicar el programa cuando el cohort ya lo incluye como prefijo.
// Ej: programa "Workshop Inmobiliario" + cohort "Workshop Inmobiliario — Mayo 2026"
// => "Workshop Inmobiliario — Mayo 2026" (no "Workshop Inmobiliario — Workshop Inmobiliario — Mayo 2026").
function courseLabel(programName: string, cohortName: string): string {
  const p = (programName ?? "").trim();
  const c = (cohortName ?? "").trim();
  if (!p) return c;
  if (!c) return p;
  if (c.toLowerCase().startsWith(p.toLowerCase())) return c;
  return `${p} — ${c}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
