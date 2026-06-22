import { getResendClient, FROM_EMAIL } from "@/lib/resend/client";

export type SupportKind = "problem" | "feature";

export interface SupportAttachment {
  filename: string;
  /** Contenido en base64 (sin el prefijo data:). */
  content: string;
}

interface SupportRequestInput {
  kind: SupportKind;
  message: string;
  fromName: string;
  fromEmail: string;
  pageUrl?: string;
  attachments?: SupportAttachment[];
}

const RECIPIENT = process.env.TEAM_NOTIFICATION_EMAIL ?? "edaza@capitalinteligente.cl";

const KIND_LABEL: Record<SupportKind, string> = {
  problem: "Problema reportado",
  feature: "Solicitud de función",
};

export async function sendSupportRequest(
  params: SupportRequestInput,
): Promise<{ success: boolean; error?: string }> {
  const resend = getResendClient();
  const label = KIND_LABEL[params.kind];

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: RECIPIENT,
      replyTo: params.fromEmail,
      subject: `[Soporte · ${label}] ${params.fromName}`,
      html: supportHtml({ ...params, label }),
      text: supportText({ ...params, label }),
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
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

function supportHtml(d: SupportRequestInput & { label: string }): string {
  const accent = d.kind === "problem" ? "#e11d48" : "#5e17eb";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#14163a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);">
        <tr><td style="padding:24px 28px;background:#14163a;">
          <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:#c5f122;text-transform:uppercase;font-weight:700;">Centro de ayuda · Capital Academy</p>
          <h1 style="margin:8px 0 0 0;font-size:20px;color:#ffffff;font-weight:800;">${esc(d.label)}</h1>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;line-height:1.6;">
            <tr><td style="padding:4px 0;color:#3a3d5c;"><strong>De:</strong> ${esc(d.fromName)} &lt;${esc(d.fromEmail)}&gt;</td></tr>
            ${d.pageUrl ? `<tr><td style="padding:4px 0;color:#3a3d5c;"><strong>Página:</strong> ${esc(d.pageUrl)}</td></tr>` : ""}
          </table>
          <div style="margin:16px 0 0 0;padding:16px;border-left:4px solid ${accent};background:#f8f8fb;border-radius:8px;">
            <p style="margin:0;font-size:15px;line-height:1.7;color:#14163a;white-space:pre-wrap;">${esc(d.message)}</p>
          </div>
          ${
            d.attachments && d.attachments.length > 0
              ? `<p style="margin:16px 0 0 0;font-size:13px;color:#6b6e8c;">📎 ${d.attachments.length} captura(s) adjunta(s).</p>`
              : ""
          }
          <p style="margin:20px 0 0 0;font-size:13px;color:#6b6e8c;">Responde este correo para contestarle directamente a la persona.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function supportText(d: SupportRequestInput & { label: string }): string {
  return [
    `${d.label} — Capital Academy`,
    "",
    `De: ${d.fromName} <${d.fromEmail}>`,
    d.pageUrl ? `Página: ${d.pageUrl}` : "",
    "",
    d.message,
    "",
    d.attachments && d.attachments.length > 0 ? `Adjuntos: ${d.attachments.length} captura(s).` : "",
    "",
    "Responde este correo para contestarle directamente a la persona.",
  ]
    .filter(Boolean)
    .join("\n");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
