import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";

interface PaymentConfirmationInput {
  paymentId: string;
  firstname: string;
  lastname: string;
  email: string;
  rut: string;
  phone: string;
  amountClp: number;
  paidAt: Date;
}

// Base URL pública usada para resolver assets embebidos en el email
// (logos, etc). Debe apuntar al dominio donde Next sirve `public/`.
function getPublicBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv && !fromEnv.startsWith("http://localhost")) {
    return fromEnv;
  }
  return "https://capitalacademy.vercel.app";
}

const moneyFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

export async function sendPaymentConfirmationEmail(
  data: PaymentConfirmationInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const resend = getResendClient();
  const amount = moneyFormatter.format(data.amountClp);
  const date = dateFormatter.format(data.paidAt);

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject: "Inscripción confirmada · Diplomado Capital Academy",
      html: studentEmailHtml({ ...data, amount, date }),
      text: studentEmailText({ ...data, amount, date }),
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

export async function sendPaymentTeamNotification(
  data: PaymentConfirmationInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const recipient = process.env.TEAM_NOTIFICATION_EMAIL;
  if (!recipient) {
    return { ok: false, error: "TEAM_NOTIFICATION_EMAIL not configured" };
  }

  const resend = getResendClient();
  const amount = moneyFormatter.format(data.amountClp);
  const date = dateFormatter.format(data.paidAt);

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipient,
      subject: `Pago recibido · ${data.firstname} ${data.lastname} · ${amount}`,
      html: teamEmailHtml({ ...data, amount, date }),
      text: teamEmailText({ ...data, amount, date }),
      replyTo: data.email,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id ?? "" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

interface RenderInput extends PaymentConfirmationInput {
  amount: string;
  date: string;
}

function studentEmailHtml(d: RenderInput): string {
  const baseUrl = getPublicBaseUrl();
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#141414;border:1px solid #262626;border-radius:16px;overflow:hidden;">
        <tr><td align="center" style="padding:32px 32px 8px 32px;">
          <img src="${baseUrl}/email/logo-light.png" alt="Capital Academy" width="96" height="95" style="display:block;width:96px;height:auto;margin:0 auto 16px auto;border:0;outline:none;text-decoration:none;" />
          <h1 style="margin:0;font-size:24px;line-height:1.25;color:#fff;font-weight:800;letter-spacing:-0.02em;text-align:center;">Inscripción confirmada</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 24px 32px;">
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#e5e5e5;">Hola <strong>${escapeHtml(d.firstname)}</strong>,</p>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#e5e5e5;">Recibimos tu pago de <strong>${escapeHtml(d.amount)}</strong>. Tu cupo en el <strong>Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria</strong> está confirmado.</p>
        </td></tr>
        <tr><td style="padding:0 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0a;border:1px solid #262626;border-radius:12px;">
            <tr><td style="padding:20px;">
              <p style="margin:0 0 12px 0;font-size:11px;letter-spacing:0.2em;color:#a3a3a3;text-transform:uppercase;font-weight:600;">Próximos pasos</p>
              <ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.7;color:#d4d4d4;">
                <li>Te contactaremos en las próximas 24 horas con el calendario de clases y el acceso a la plataforma.</li>
                <li>Recibirás un correo separado con tu credencial de ingreso.</li>
                <li>Si tienes preguntas urgentes, responde este correo.</li>
              </ul>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px 8px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:12px;color:#737373;">
            <tr><td style="padding:6px 0;"><strong style="color:#a3a3a3;">ID de pago:</strong> ${escapeHtml(d.paymentId)}</td></tr>
            <tr><td style="padding:6px 0;"><strong style="color:#a3a3a3;">Fecha:</strong> ${escapeHtml(d.date)}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #262626;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#737373;">Capital Academy · Este correo confirma tu inscripción. Guárdalo para tus registros.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function studentEmailText(d: RenderInput): string {
  return [
    `Hola ${d.firstname},`,
    "",
    `Recibimos tu pago de ${d.amount}. Tu cupo en el Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria está confirmado.`,
    "",
    "Próximos pasos:",
    "• Te contactaremos en las próximas 24 horas con el calendario de clases y el acceso a la plataforma.",
    "• Recibirás un correo separado con tu credencial de ingreso.",
    "• Si tienes preguntas urgentes, responde este correo.",
    "",
    `ID de pago: ${d.paymentId}`,
    `Fecha: ${d.date}`,
    "",
    "Capital Academy",
  ].join("\n");
}

function teamEmailHtml(d: RenderInput): string {
  const baseUrl = getPublicBaseUrl();
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#171717;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:20px 24px;background:#0a0a0a;color:#fff;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td valign="middle" style="width:48px;padding-right:12px;"><img src="${baseUrl}/email/logo-light.png" alt="Capital Academy" width="40" height="40" style="display:block;width:40px;height:auto;border:0;outline:none;" /></td>
        <td valign="middle">
          <p style="margin:0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#22d3ee;">Pago recibido</p>
          <h1 style="margin:2px 0 0 0;font-size:18px;font-weight:700;">${escapeHtml(d.firstname)} ${escapeHtml(d.lastname)} · ${escapeHtml(d.amount)}</h1>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:20px 24px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;">
        <tr><td style="padding:6px 0;color:#737373;width:120px;">Email</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(d.email)}" style="color:#0070f3;">${escapeHtml(d.email)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#737373;">Teléfono</td><td style="padding:6px 0;">${escapeHtml(d.phone)}</td></tr>
        <tr><td style="padding:6px 0;color:#737373;">RUT</td><td style="padding:6px 0;">${escapeHtml(d.rut)}</td></tr>
        <tr><td style="padding:6px 0;color:#737373;">Pagado el</td><td style="padding:6px 0;">${escapeHtml(d.date)}</td></tr>
        <tr><td style="padding:6px 0;color:#737373;">Payment ID</td><td style="padding:6px 0;font-family:monospace;font-size:12px;">${escapeHtml(d.paymentId)}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:16px 24px;background:#fafafa;border-top:1px solid #e5e5e5;font-size:12px;color:#737373;">
      Responde este correo para contactar al alumno directamente.
    </td></tr>
  </table>
</body></html>`;
}

function teamEmailText(d: RenderInput): string {
  return [
    `Pago recibido: ${d.firstname} ${d.lastname} · ${d.amount}`,
    "",
    `Email: ${d.email}`,
    `Teléfono: ${d.phone}`,
    `RUT: ${d.rut}`,
    `Pagado el: ${d.date}`,
    `Payment ID: ${d.paymentId}`,
    "",
    "Responde este correo para contactar al alumno directamente.",
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
