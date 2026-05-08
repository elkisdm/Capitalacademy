export const COMUNIDAD_WHATSAPP_URL =
  "https://chat.whatsapp.com/DCRICRJ7cQ1B2d7P2u9g8j?mode=gi_t";

/** Fecha de cierre de la próxima cohorte del Diplomado (ISO YYYY-MM-DD). */
export const DIPLOMADO_CLOSE_DATE = "2026-05-15";

/** Precio regular del Diplomado (sin descuento de cohorte de lanzamiento). */
export const DIPLOMADO_REGULAR_PRICE_CLP = 1_000_000;

/** Días restantes hasta el cierre. Calculado en server-side render. */
export function daysUntilClose(closeDate = DIPLOMADO_CLOSE_DATE): number {
  const close = new Date(`${closeDate}T23:59:59-04:00`);
  const now = new Date();
  const diffMs = close.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/** Cierre formateado en español, ej: "15 de mayo". */
export function formatCloseDate(closeDate = DIPLOMADO_CLOSE_DATE): string {
  const d = new Date(`${closeDate}T12:00:00-04:00`);
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    timeZone: "America/Santiago",
  }).format(d);
}
