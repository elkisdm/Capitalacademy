import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";
import { isPaymentPlan, PAYMENT_PLANS } from "@/lib/flow/checkout";
import {
  isLiderazgoPlan,
  liderazgoPlanLabel,
  LIDERAZGO_PROGRAM_NAME,
  LIDERAZGO_PROGRAM_SHORT,
} from "@/lib/programs/liderazgo";

const DIPLOMADO_PROGRAM_NAME =
  "Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria";
const DIPLOMADO_PROGRAM_SHORT = "Diplomado";

// Resuelve el programa a partir de la clave de plan. Cada programa matchea sus
// propios planes; el fallback (pagos legacy sin plan o planes desconocidos) es
// neutro — NO se asume Diplomado, para que un programa futuro no herede su marca.
function resolveProgram(plan: string | null): {
  name: string;
  short: string;
} {
  if (plan && isLiderazgoPlan(plan)) {
    return { name: LIDERAZGO_PROGRAM_NAME, short: LIDERAZGO_PROGRAM_SHORT };
  }
  if (plan && isPaymentPlan(plan)) {
    return { name: DIPLOMADO_PROGRAM_NAME, short: DIPLOMADO_PROGRAM_SHORT };
  }
  return { name: "Capital Academy", short: "Capital Academy" };
}

interface PaymentConfirmationInput {
  paymentId: string;
  firstname: string;
  lastname: string;
  email: string;
  rut: string;
  phone: string;
  amountClp: number;
  paidAt: Date;
  // Null para pagos legacy previos a la columna `plan`.
  plan: string | null;
  couponCode?: string | null;
  discountClp?: number | null;
}

// Etiqueta legible del plan para mostrar en el email. Para pagos antiguos
// sin `plan` registrado, devolvemos null y el bloque se omite.
function planLabel(plan: string | null): string | null {
  if (plan && isPaymentPlan(plan)) {
    return PAYMENT_PLANS[plan].label;
  }
  return liderazgoPlanLabel(plan);
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
  const plan = planLabel(data.plan);
  const program = resolveProgram(data.plan);
  const discountFormatted =
    data.couponCode && data.discountClp && data.discountClp > 0
      ? moneyFormatter.format(data.discountClp)
      : null;

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.email,
      subject: `Inscripción confirmada · ${program.short} · Capital Academy`,
      html: studentEmailHtml({
        ...data,
        amount,
        date,
        plan,
        discountFormatted,
        programName: program.name,
      }),
      text: studentEmailText({
        ...data,
        amount,
        date,
        plan,
        discountFormatted,
        programName: program.name,
      }),
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
  const plan = planLabel(data.plan);
  const program = resolveProgram(data.plan);
  const discountFormatted =
    data.couponCode && data.discountClp && data.discountClp > 0
      ? moneyFormatter.format(data.discountClp)
      : null;

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipient,
      subject: `Pago recibido · ${program.short} · ${data.firstname} ${data.lastname} · ${amount}`,
      html: teamEmailHtml({
        ...data,
        amount,
        date,
        plan,
        discountFormatted,
        programName: program.name,
      }),
      text: teamEmailText({
        ...data,
        amount,
        date,
        plan,
        discountFormatted,
        programName: program.name,
      }),
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
  plan: string | null;
  discountFormatted: string | null;
  programName: string;
}

function studentEmailHtml(d: RenderInput): string {
  const baseUrl = getPublicBaseUrl();
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#070a29;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070a29;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#10164a;border:1px solid rgba(217,245,94,0.22);border-radius:24px;overflow:hidden;">
        <tr><td style="padding:0;background:linear-gradient(135deg,#d9f55e 0%,#c8f08c 55%,#d9f55e 100%);">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr><td align="center" style="padding:36px 28px 28px 28px;">
              <img src="${baseUrl}/email/logo-on-light.png" alt="Capital Academy" width="88" height="86" style="display:block;width:88px;height:auto;margin:0 auto 18px auto;border:0;outline:none;text-decoration:none;" />
              <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.3em;color:#0d1340;text-transform:uppercase;font-weight:800;">Capital Academy</p>
              <h1 style="margin:0;font-size:28px;line-height:1.2;color:#0d1340;font-weight:900;letter-spacing:-0.03em;text-align:center;">Inscripción confirmada</h1>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:32px 32px 8px 32px;">
          <p style="margin:0 0 18px 0;font-size:16px;line-height:1.55;color:#ffffff;">Hola <strong style="color:#d9f55e;">${escapeHtml(d.firstname)}</strong>,</p>
          <p style="margin:0 0 6px 0;font-size:15px;line-height:1.65;color:rgba(255,255,255,0.86);">Tu pago de <strong style="color:#d9f55e;">${escapeHtml(d.amount)}</strong> fue aprobado. Tu cupo en el <strong style="color:#ffffff;">${escapeHtml(d.programName)}</strong> queda confirmado.</p>
        </td></tr>
        <tr><td style="padding:20px 32px 8px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:rgba(91,45,235,0.18);border:1px solid rgba(217,245,94,0.22);border-radius:16px;">
            <tr><td style="padding:22px 22px 18px 22px;">
              <p style="margin:0 0 14px 0;font-size:11px;letter-spacing:0.24em;color:#d9f55e;text-transform:uppercase;font-weight:800;">Próximos pasos</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;color:rgba(255,255,255,0.9);">
                <tr><td valign="top" style="width:24px;padding:6px 0;color:#d9f55e;font-weight:800;">1.</td><td style="padding:6px 0;">Te contactaremos en las próximas 24 horas con el calendario y el acceso a la plataforma.</td></tr>
                <tr><td valign="top" style="width:24px;padding:6px 0;color:#d9f55e;font-weight:800;">2.</td><td style="padding:6px 0;">Recibirás un correo separado con tu credencial de ingreso al portal del alumno.</td></tr>
                <tr><td valign="top" style="width:24px;padding:6px 0;color:#d9f55e;font-weight:800;">3.</td><td style="padding:6px 0;">Si tienes preguntas urgentes, responde directamente este correo.</td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:22px 32px 6px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid rgba(255,255,255,0.1);border-radius:12px;overflow:hidden;">
            <tr>
              <td style="width:35%;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(212,184,255,0.85);">Valor pagado</td>
              <td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;color:#ffffff;font-weight:700;">${escapeHtml(d.amount)}</td>
            </tr>
            ${
              d.plan
                ? `<tr>
              <td style="width:35%;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(212,184,255,0.85);">Forma de pago</td>
              <td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;color:#ffffff;">${escapeHtml(d.plan)}</td>
            </tr>`
                : ""
            }
            ${
              d.couponCode && d.discountFormatted
                ? `<tr>
              <td style="width:35%;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(212,184,255,0.85);">Cupón</td>
              <td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;color:#d9f55e;font-weight:700;">${escapeHtml(d.couponCode)} · −${escapeHtml(d.discountFormatted)}</td>
            </tr>`
                : ""
            }
            <tr>
              <td style="width:35%;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(212,184,255,0.85);">Fecha</td>
              <td style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;color:#ffffff;">${escapeHtml(d.date)}</td>
            </tr>
            <tr>
              <td style="width:35%;padding:12px 14px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(212,184,255,0.85);">ID de pago</td>
              <td style="padding:12px 14px;font-size:12px;color:rgba(255,255,255,0.78);font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;">${escapeHtml(d.paymentId)}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:28px 32px 36px 32px;">
          <p style="margin:0 0 4px 0;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.7);">Gracias por confiar en <strong style="color:#d9f55e;">Capital Academy</strong>.</p>
          <p style="margin:0;font-size:11px;line-height:1.6;color:rgba(212,184,255,0.55);">Guarda este correo como comprobante de tu inscripción.</p>
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
    `Recibimos tu pago de ${d.amount}${d.plan ? ` (${d.plan})` : ""}. Tu cupo en el ${d.programName} está confirmado.`,
    "",
    "Próximos pasos:",
    "• Te contactaremos en las próximas 24 horas con el calendario de clases y el acceso a la plataforma.",
    "• Recibirás un correo separado con tu credencial de ingreso.",
    "• Si tienes preguntas urgentes, responde este correo.",
    "",
    `ID de pago: ${d.paymentId}`,
    `Fecha: ${d.date}`,
    ...(d.plan ? [`Forma de pago: ${d.plan}`] : []),
    ...(d.couponCode && d.discountFormatted
      ? [`Cupón aplicado: ${d.couponCode} (−${d.discountFormatted})`]
      : []),
    "",
    "Capital Academy",
  ].join("\n");
}

function teamEmailHtml(d: RenderInput): string {
  const baseUrl = getPublicBaseUrl();
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f4f4f7;font-family:Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0d1340;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(13,19,64,0.08);">
    <tr><td style="padding:0;background:#070a29;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td valign="middle" style="width:64px;padding:18px 0 18px 22px;">
          <img src="${baseUrl}/email/logo-on-light.png" alt="Capital Academy" width="40" height="40" style="display:block;width:40px;height:auto;border:0;outline:none;background:#d9f55e;border-radius:8px;padding:4px;" />
        </td>
        <td valign="middle" style="padding:18px 22px 18px 14px;">
          <p style="margin:0;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#d9f55e;font-weight:800;">Pago recibido · Capital Academy</p>
          <h1 style="margin:3px 0 0 0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">${escapeHtml(d.firstname)} ${escapeHtml(d.lastname)} · ${escapeHtml(d.amount)}</h1>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:24px 24px 8px 24px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#5b2deb;width:120px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">Email</td><td style="padding:8px 0;color:#0d1340;"><a href="mailto:${escapeHtml(d.email)}" style="color:#5b2deb;text-decoration:none;font-weight:600;">${escapeHtml(d.email)}</a></td></tr>
        <tr><td style="padding:8px 0;color:#5b2deb;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">Teléfono</td><td style="padding:8px 0;color:#0d1340;">${escapeHtml(d.phone)}</td></tr>
        <tr><td style="padding:8px 0;color:#5b2deb;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">RUT</td><td style="padding:8px 0;color:#0d1340;">${escapeHtml(d.rut)}</td></tr>
        <tr><td style="padding:8px 0;color:#5b2deb;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">Pagado el</td><td style="padding:8px 0;color:#0d1340;">${escapeHtml(d.date)}</td></tr>
        ${
          d.plan
            ? `<tr><td style="padding:8px 0;color:#5b2deb;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">Plan</td><td style="padding:8px 0;color:#0d1340;font-weight:600;">${escapeHtml(d.plan)}</td></tr>`
            : ""
        }
        ${
          d.couponCode && d.discountFormatted
            ? `<tr><td style="padding:8px 0;color:#5b2deb;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">Cupón</td><td style="padding:8px 0;color:#0d1340;font-weight:600;">${escapeHtml(d.couponCode)} · −${escapeHtml(d.discountFormatted)}</td></tr>`
            : ""
        }
        <tr><td style="padding:8px 0;color:#5b2deb;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">Payment ID</td><td style="padding:8px 0;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:12px;color:#3a14c7;">${escapeHtml(d.paymentId)}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:18px 24px;background:#f9faff;border-top:1px solid rgba(91,45,235,0.12);font-size:12px;color:#5b2deb;line-height:1.6;">
      <strong style="color:#0d1340;">Tip:</strong> responde este correo para contactar al alumno directamente — el reply va a su email.
    </td></tr>
  </table>
</body></html>`;
}

function teamEmailText(d: RenderInput): string {
  return [
    `Pago recibido: ${d.firstname} ${d.lastname} · ${d.amount}${d.plan ? ` · ${d.plan}` : ""}`,
    "",
    `Email: ${d.email}`,
    `Teléfono: ${d.phone}`,
    `RUT: ${d.rut}`,
    `Pagado el: ${d.date}`,
    ...(d.plan ? [`Plan: ${d.plan}`] : []),
    ...(d.couponCode && d.discountFormatted
      ? [`Cupón: ${d.couponCode} (−${d.discountFormatted})`]
      : []),
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
