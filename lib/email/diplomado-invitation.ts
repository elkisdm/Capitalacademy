import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";

// Correo de onboarding del Diplomado (IV Generación). Espeja el template
// fusionado de `scripts/invite-diplomado-g4.mjs` (bienvenida + qué aprenderás +
// activación + logística de la 1ª clase presencial + firma del equipo), para
// que el comprador que se matricula al pagar reciba EXACTAMENTE el mismo correo
// que los alumnos invitados a mano. Es G4-específico a propósito; el correo
// genérico vive en `lib/email/invitation.ts`.

const PROGRAM_NAME =
  "Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria";

interface DiplomadoInvitationInput {
  email: string;
  fullName: string;
  inviteUrl: string;
}

export async function sendDiplomadoInvitationEmail(
  params: DiplomadoInvitationInput,
): Promise<{ success: boolean; error?: string }> {
  const resend = getResendClient();
  const firstName = params.fullName.split(" ")[0];

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.email,
      subject: `${firstName}, tu acceso al Diplomado en Capital Academy ya está disponible 🎓`,
      html: invitationHtml(params),
      text: invitationText(params),
    });
    if (result.error) return { success: false, error: result.error.message };
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

function invitationHtml({ fullName, inviteUrl }: DiplomadoInvitationInput): string {
  const firstName = fullName.split(" ")[0];
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);">
      <tr><td style="padding:0;background:#14163a;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 28px;">
        <img src="https://capitalacademy.cl/brand/logo-light.png" alt="Capital Academy" width="200" style="display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;" />
        <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;">Plataforma educativa</p>
      </td></tr></table></td></tr>
      <tr><td style="padding:32px 32px 8px 32px;">
        <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.3;color:#14163a;font-weight:800;">&iexcl;Bienvenido a Capital Academy, ${esc(firstName)}!</h1>
        <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Es un placer darte la bienvenida a la <strong>IV Generaci&oacute;n</strong> del <strong>${esc(PROGRAM_NAME)}</strong>. Est&aacute;s a punto de iniciar un camino que transformar&aacute; tu forma de entender y ejercer la venta inmobiliaria: una nueva metodolog&iacute;a comercial, t&eacute;cnicas de cierre, herramientas de soporte al asesor, gesti&oacute;n de clientes y negociaci&oacute;n.</p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">Hoy damos el primer paso: tu acceso a <strong style="color:#5e17eb;">Capital Academy</strong>, donde tendr&aacute;s tu calendario de clases, el material de cada sesi&oacute;n y todo lo que necesitas durante el programa.</p>
      </td></tr>
      <tr><td style="padding:0 32px 8px 32px;">
        <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">Qu&eacute; encontrar&aacute;s adentro</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;color:#3a3d5c;">
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;width:26px;">&#128197;</td><td style="padding:5px 0;"><strong>Tu calendario de clases en vivo</strong>, con fechas, horarios y docentes.</td></tr>
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;">&#128218;</td><td style="padding:5px 0;"><strong>Material y recursos</strong> complementarios de cada sesi&oacute;n.</td></tr>
          <tr><td style="padding:5px 12px 5px 0;vertical-align:top;">&#127942;</td><td style="padding:5px 0;"><strong>Pon a prueba lo aprendido</strong> y obt&eacute;n tu certificado.</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 32px 12px 32px;">
        <a href="${esc(inviteUrl)}" target="_blank" style="display:inline-block;padding:15px 44px;background:#5e17eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">Activar mi acceso y entrar</a>
      </td></tr>
      <tr><td style="padding:0 32px 24px 32px;"><p style="margin:0;font-size:13px;line-height:1.6;color:#6b6e8a;text-align:center;">El enlace expira en 72 horas. Al activarlo, creas tu contrase&ntilde;a y entras a la plataforma.</p></td></tr>
      <tr><td style="padding:0 32px 32px 32px;">
        <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">C&oacute;mo empezar</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;color:#3a3d5c;">
          <tr><td style="padding:4px 12px 4px 0;color:#5e17eb;font-weight:800;vertical-align:top;width:24px;">1.</td><td style="padding:4px 0;"><strong>Activa tu cuenta</strong> &mdash; crea tu contrase&ntilde;a <span style="color:#9b9db5;">(1 min)</span></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5e17eb;font-weight:800;vertical-align:top;">2.</td><td style="padding:4px 0;"><strong>Completa tu perfil</strong> (RUT, tel&eacute;fono) <span style="color:#9b9db5;">(2 min)</span></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#5e17eb;font-weight:800;vertical-align:top;">3.</td><td style="padding:4px 0;"><strong>Revisa tu calendario y te esperamos en tu primera clase</strong></td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 22px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f1ff;border-radius:12px;border:1px solid #e7defc;">
          <tr><td style="padding:18px 20px;">
            <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:0.15em;color:#5e17eb;text-transform:uppercase;font-weight:800;">Tu primera clase &middot; presencial</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.55;color:#3a3d5c;">
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;width:24px;">&#128197;</td><td style="padding:3px 0;"><strong>S&aacute;bado 20 de junio</strong> &middot; 9:30 a.m.</td></tr>
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;">&#128205;</td><td style="padding:3px 0;">Av. Presidente Kennedy 8017 (edificio Sony), piso 4, Las Condes.</td></tr>
              <tr><td style="padding:3px 12px 3px 0;vertical-align:top;">&#128663;</td><td style="padding:3px 0;">Estacionamientos disponibles. Te sugerimos llegar unos minutos antes.</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 28px 32px;"><p style="margin:0;font-size:14px;line-height:1.6;color:#3a3d5c;">&iexcl;Te esperamos con todo listo! Si tienes alguna consulta antes del inicio, escr&iacute;benos.<br/><strong>Equipo Capital Academy</strong></p></td></tr>
      <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;"><p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="https://capitalacademy.cl" style="color:#5e17eb;text-decoration:none;">capitalacademy.cl</a></p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function invitationText({ fullName, inviteUrl }: DiplomadoInvitationInput): string {
  const firstName = fullName.split(" ")[0];
  return [
    `¡Bienvenido a Capital Academy, ${firstName}!`, "",
    `Es un placer darte la bienvenida a la IV Generación del ${PROGRAM_NAME}. Estás a punto de iniciar un camino que transformará tu forma de entender y ejercer la venta inmobiliaria: una nueva metodología comercial, técnicas de cierre, herramientas de soporte al asesor, gestión de clientes y negociación.`, "",
    "Hoy damos el primer paso: tu acceso a Capital Academy, donde tendrás tu calendario de clases, el material de cada sesión y todo lo que necesitas durante el programa.", "",
    "Qué encontrarás adentro:",
    "  • Tu calendario de clases en vivo, con fechas, horarios y docentes.",
    "  • Material y recursos complementarios de cada sesión.",
    "  • Pon a prueba lo aprendido y obtén tu certificado.", "",
    `Activa tu acceso y entra: ${inviteUrl}`, "",
    "El enlace expira en 72 horas. Al activarlo, creas tu contraseña y entras a la plataforma.", "",
    "Cómo empezar:",
    "  1. Activa tu cuenta — crea tu contraseña (1 min)",
    "  2. Completa tu perfil — RUT, teléfono (2 min)",
    "  3. Revisa tu calendario y te esperamos en tu primera clase", "",
    "TU PRIMERA CLASE (presencial):",
    "  • Sábado 20 de junio · 9:30 a.m.",
    "  • Av. Presidente Kennedy 8017 (edificio Sony), piso 4, Las Condes.",
    "  • Estacionamientos disponibles. Te sugerimos llegar unos minutos antes.", "",
    "¡Te esperamos con todo listo! Si tienes alguna consulta antes del inicio, escríbenos.",
    "Equipo Capital Academy", "",
    "Capital Academy · capitalacademy.cl",
  ].join("\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
