import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";

export type ConversacionNotificationKind = "reply" | "mention";

export interface ConversacionNotificationInput {
  to: string;
  recipientName: string;
  actorName: string;
  threadTitle: string;
  kind: ConversacionNotificationKind;
  url: string;
}

export async function sendConversacionNotificationEmail(
  params: ConversacionNotificationInput,
): Promise<{ success: boolean; error?: string }> {
  const resend = getResendClient();

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: subjectFor(params),
      html: notificationHtml(params),
      text: notificationText(params),
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

function subjectFor(d: ConversacionNotificationInput): string {
  return d.kind === "mention"
    ? `${d.actorName} te mencionó en una conversación`
    : `${d.actorName} respondió tu conversación`;
}

function eyebrowFor(kind: ConversacionNotificationKind): string {
  return kind === "mention" ? "Te mencionaron" : "Nueva respuesta";
}

function leadFor(d: ConversacionNotificationInput): string {
  return d.kind === "mention"
    ? `${d.actorName} te mencionó en la conversación:`
    : `${d.actorName} respondió tu conversación:`;
}

function notificationHtml(d: ConversacionNotificationInput): string {
  const firstName = (d.recipientName || "").split(" ")[0] || "";

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
              <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;">${esc(eyebrowFor(d.kind))}</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px 32px 8px 32px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;color:#14163a;font-weight:800;">Hola${firstName ? ", " + esc(firstName) : ""} 👋</h1>
          <p style="margin:0 0 4px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">${esc(leadFor(d))}</p>
        </td></tr>

        <!-- Tarjeta de la conversación -->
        <tr><td style="padding:16px 32px 8px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9f9fb;border:1px solid #ededf0;border-radius:12px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0;font-size:17px;line-height:1.35;color:#5e17eb;font-weight:800;">${esc(d.threadTitle)}</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td align="center" style="padding:24px 32px 28px 32px;">
          <a href="${esc(d.url)}" target="_blank" style="display:inline-block;padding:14px 40px;background:#5e17eb;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">Ver la conversación</a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f9f9fb;border-top:1px solid #ededf0;">
          <p style="margin:0;font-size:12px;color:#9b9db5;text-align:center;">Capital Academy &middot; <a href="https://capitalacademy.cl/classroom" style="color:#5e17eb;text-decoration:none;">Ir a la plataforma</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

function notificationText(d: ConversacionNotificationInput): string {
  const firstName = (d.recipientName || "").split(" ")[0] || "";
  return [
    `Hola${firstName ? ", " + firstName : ""}.`,
    "",
    leadFor(d),
    "",
    d.threadTitle,
    "",
    `Ver la conversación: ${d.url}`,
    "",
    "Capital Academy · capitalacademy.cl/classroom",
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
