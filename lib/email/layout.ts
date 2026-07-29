/**
 * Shell de correo de Capital Academy, parametrizado por marca de entorno.
 *
 * El repo ya tiene este mismo HTML copiado en cuatro archivos
 * (`capacitacion-emails`, `deliverable-open`, `deliverable-received`,
 * `recording-available`), cada uno con su `shell()` y su `esc()` privados. Este
 * módulo es la versión compartida y la usan las plantillas NUEVAS (campañas y
 * encuestas). No se migran las cuatro existentes en este cambio: son correos
 * transaccionales en producción y tocarlos aquí sería un refactor no pedido.
 *
 * La diferencia real con esas copias es que el acento no está hardcodeado a
 * violeta: sale de `lib/programs/registry.ts`, así que un comunicado del
 * Programa de Liderazgo llega en ámbar y uno del Ciclo CI en rosa.
 */

import { getPublicBaseUrl } from "@/lib/api/base-url";
import { escapeHtml } from "@/lib/email/markdown";

const SITE_URL = getPublicBaseUrl();
const PLATFORM_URL = `${SITE_URL}/classroom`;
const BRAND_LOGO_URL = `${SITE_URL}/brand/logo-light.png`;

/** Tokens de la identidad de correo, comunes a todos los entornos. */
export const EMAIL_COLORS = {
  page: "#f4f4f7",
  header: "#14163a",
  eyebrow: "#c5f122",
  ink: "#14163a",
  body: "#3a3d5c",
  muted: "#9b9db5",
  card: "#f9f9fb",
  border: "#ededf0",
  surface: "#ffffff",
} as const;

const FONT_STACK =
  "Montserrat,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

export type EmailShellInput = {
  /** Etiqueta pequeña en mayúsculas bajo el logo. */
  eyebrow: string;
  /** HTML del cuerpo (filas `<tr>` de la tabla de 600px). */
  bodyInner: string;
  /**
   * Texto de vista previa. Va oculto al inicio del `<body>`: es lo que el
   * cliente de correo muestra junto al asunto en la bandeja.
   */
  preheader?: string;
  /** Pie legal/contextual opcional bajo el enlace a la plataforma. */
  footerNote?: string;
};

/**
 * Bloque oculto de preview. El relleno de entidades invisibles evita que el
 * cliente rellene la vista previa con las primeras palabras del cuerpo.
 */
function preheaderBlock(text: string): string {
  const filler = "&#847;&zwnj;&nbsp;".repeat(60);
  return `<div style="display:none;font-size:1px;color:${EMAIL_COLORS.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(text)}${filler}</div>`;
}

export function emailShell({
  eyebrow,
  bodyInner,
  preheader,
  footerNote,
}: EmailShellInput): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${EMAIL_COLORS.page};font-family:${FONT_STACK};color:${EMAIL_COLORS.ink};">
${preheader ? preheaderBlock(preheader) : ""}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_COLORS.page};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:${EMAIL_COLORS.surface};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(20,22,58,0.08);">

        <!-- Header -->
        <tr><td style="padding:0;background:${EMAIL_COLORS.header};">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr><td align="center" style="padding:32px 28px;">
              <img src="${BRAND_LOGO_URL}" alt="Capital Academy" width="200" style="display:block;width:200px;max-width:62%;height:auto;margin:0 auto 10px auto;border:0;outline:none;text-decoration:none;" />
              <p style="margin:0;font-size:11px;letter-spacing:0.3em;color:${EMAIL_COLORS.eyebrow};text-transform:uppercase;font-weight:700;">${escapeHtml(eyebrow)}</p>
            </td></tr>
          </table>
        </td></tr>

${bodyInner}

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:${EMAIL_COLORS.card};border-top:1px solid ${EMAIL_COLORS.border};">
          <p style="margin:0;font-size:12px;color:${EMAIL_COLORS.muted};text-align:center;">Capital Academy &middot; <a href="${PLATFORM_URL}" style="color:#5e17eb;text-decoration:none;">Ir a la plataforma</a></p>
${footerNote ? `          <p style="margin:8px 0 0 0;font-size:11px;color:${EMAIL_COLORS.muted};text-align:center;line-height:1.5;">${escapeHtml(footerNote)}</p>` : ""}
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Botón de acción principal, con el acento del entorno. */
export function emailButton(url: string, label: string, accent: string): string {
  return `        <tr><td align="center" style="padding:8px 32px 32px 32px;">
          <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 40px;background:${accent};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">${escapeHtml(label)}</a>
        </td></tr>`;
}

/** Fila de contenido estándar (padding lateral de 32px). */
export function emailSection(innerHtml: string, extraStyle = ""): string {
  return `        <tr><td style="padding:32px 32px 8px 32px;${extraStyle}">
${innerHtml}
        </td></tr>`;
}

/** Saludo por nombre de pila. Sin nombre, saluda sin quedar cojo. */
export function emailGreeting(fullName: string | null | undefined): string {
  const first = (fullName || "").trim().split(/\s+/)[0] || "";
  return first ? `Hola, ${escapeHtml(first)} 👋` : "Hola 👋";
}

/** Nombre de pila en texto plano, para la versión `text` del correo. */
export function firstNameOf(fullName: string | null | undefined): string {
  return (fullName || "").trim().split(/\s+/)[0] || "";
}

export { PLATFORM_URL, SITE_URL, FONT_STACK };
