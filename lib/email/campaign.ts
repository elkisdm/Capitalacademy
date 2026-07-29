/**
 * Plantilla de un comunicado masivo (`/admin/comunicaciones`).
 *
 * A diferencia del resto de `lib/email/*`, el cuerpo NO está fijo en código: lo
 * escribe el equipo en Markdown y se renderiza al enviar. Por eso la plantilla
 * aporta solo el marco —marca del entorno, saludo, CTA, pie— y delega el
 * contenido a `markdownToEmailHtml`.
 */

import {
  emailButton,
  emailGreeting,
  emailShell,
  firstNameOf,
  PLATFORM_URL,
} from "@/lib/email/layout";
import { markdownToEmailHtml, markdownToPlainText } from "@/lib/email/markdown";
import { DEFAULT_BRAND, type ProgramBrand } from "@/lib/programs/registry";
import type { EmailContent } from "@/lib/email/send-batch";

export type CampaignEmailInput = {
  subject: string;
  bodyMd: string;
  preheader?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** Nombre del destinatario, para el saludo. */
  fullName?: string | null;
  /** Marca del entorno. Por defecto, la genérica de Capital Academy. */
  brand?: ProgramBrand;
};

export function buildCampaignEmail(input: CampaignEmailInput): EmailContent {
  const brand = input.brand ?? DEFAULT_BRAND;
  const hasCta = Boolean(input.ctaLabel && input.ctaUrl);

  const bodyHtml = markdownToEmailHtml(input.bodyMd, brand.accent);

  const inner =
    `        <tr><td style="padding:32px 32px 8px 32px;">
          <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:#14163a;font-weight:800;">${emailGreeting(input.fullName)}</h1>
${bodyHtml}
        </td></tr>` + (hasCta ? "\n" + emailButton(input.ctaUrl!, input.ctaLabel!, brand.accent) : "");

  return {
    subject: input.subject,
    html: emailShell({
      eyebrow: brand.eyebrow,
      preheader: input.preheader ?? undefined,
      bodyInner: inner,
      // No se afirma "matrícula activa": la audiencia puede incluir matrículas
      // invitadas, completadas o suspendidas según los filtros del envío.
      footerNote: "Recibes este correo porque estás inscrito en un programa de Capital Academy.",
    }),
    text: buildText(input, brand),
  };
}

function buildText(input: CampaignEmailInput, brand: ProgramBrand): string {
  const first = firstNameOf(input.fullName);
  const lines = [
    first ? `Hola, ${first}.` : "Hola.",
    "",
    markdownToPlainText(input.bodyMd),
  ];
  if (input.ctaLabel && input.ctaUrl) {
    lines.push("", `${input.ctaLabel}: ${input.ctaUrl}`);
  }
  lines.push("", `${brand.shortName} · Capital Academy`, PLATFORM_URL);
  return lines.join("\n");
}
