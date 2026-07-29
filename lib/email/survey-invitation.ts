/**
 * Invitación a responder una encuesta (modo ANÓNIMO).
 *
 * Solo se usa en modo anónimo: en modo identificado el correo lo despacha hclp
 * con su propio token por persona, y Capital Academy no manda nada.
 *
 * REGLA CRÍTICA DEL ANONIMATO — el correo va personalizado (saludo por nombre),
 * pero `surveyUrl` debe llegar EXACTAMENTE igual a todos los destinatarios: sin
 * `?email=`, `?uid=`, `?id=` ni token. Si el enlace lleva cualquier
 * identificador, la promesa de anonimato se rompe del lado del formulario aunque
 * la respuesta no guarde el nombre. Esta función nunca concatena nada a la URL;
 * el gate está además en `lib/surveys/send.ts` (assertAnonymousUrl).
 */

import {
  emailButton,
  emailGreeting,
  emailShell,
  firstNameOf,
  PLATFORM_URL,
} from "@/lib/email/layout";
import { escapeHtml } from "@/lib/email/markdown";
import { DEFAULT_BRAND, type ProgramBrand } from "@/lib/programs/registry";
import type { EmailContent } from "@/lib/email/send-batch";

export type SurveyInvitationInput = {
  surveyTitle: string;
  /** URL pública del formulario. Idéntica para todos. */
  surveyUrl: string;
  /** Bajada opcional que explica de qué se trata. */
  intro?: string | null;
  /** Minutos estimados, para poner expectativa en el asunto y el cuerpo. */
  estimatedMinutes?: number | null;
  fullName?: string | null;
  brand?: ProgramBrand;
};

export function buildSurveyInvitationEmail(input: SurveyInvitationInput): EmailContent {
  const brand = input.brand ?? DEFAULT_BRAND;
  const minutes = input.estimatedMinutes ?? null;
  const timeHint = minutes ? ` (${minutes} minuto${minutes === 1 ? "" : "s"})` : "";
  const intro =
    input.intro?.trim() ||
    "Tu opinión nos ayuda a mejorar las próximas clases. Es breve y anónima.";

  const inner =
    `        <tr><td style="padding:32px 32px 8px 32px;">
          <h1 style="margin:0 0 14px 0;font-size:22px;line-height:1.3;color:#14163a;font-weight:800;">${emailGreeting(input.fullName)}</h1>
          <p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#3a3d5c;">${escapeHtml(intro)}</p>
        </td></tr>
        <tr><td style="padding:8px 32px 8px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9f9fb;border:1px solid #ededf0;border-radius:12px;">
            <tr><td style="padding:20px 22px;">
              <p style="margin:0;font-size:17px;line-height:1.35;color:${brand.accent};font-weight:800;">${escapeHtml(input.surveyTitle)}</p>
              <p style="margin:8px 0 0 0;font-size:13px;line-height:1.5;color:#9b9db5;">Respuesta anónima${timeHint}. No registramos quién responde qué.</p>
            </td></tr>
          </table>
        </td></tr>` +
    "\n" +
    emailButton(input.surveyUrl, "Responder la encuesta", brand.accent);

  return {
    subject: `${input.surveyTitle}${timeHint}`,
    html: emailShell({
      eyebrow: brand.eyebrow,
      preheader: intro,
      bodyInner: inner,
      footerNote: "Esta encuesta es anónima: tus respuestas no quedan asociadas a tu nombre.",
    }),
    text: [
      firstNameOf(input.fullName) ? `Hola, ${firstNameOf(input.fullName)}.` : "Hola.",
      "",
      intro,
      "",
      `${input.surveyTitle}`,
      `Responder la encuesta: ${input.surveyUrl}`,
      "",
      `Respuesta anónima${timeHint}. No registramos quién responde qué.`,
      "",
      `${brand.shortName} · Capital Academy`,
      PLATFORM_URL,
    ].join("\n"),
  };
}
