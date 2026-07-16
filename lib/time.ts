/**
 * Helper central de fechas/horas. El negocio es 100% chileno: la regla del
 * producto es "en el sistema siempre usamos la hora de Chile". Este archivo
 * existe porque esa regla se rompe de dos formas OPUESTAS si no se distingue
 * el tipo de dato subyacente:
 *
 * 1. Columnas `timestamptz` (instantes reales: `starts_at`, `unlock_at`,
 *    `opens_at`…) guardan un instante absoluto en UTC. Para mostrarlas hay
 *    que proyectarlas a la zona de Chile explícitamente — si se formatean
 *    sin `timeZone`, heredan la zona del runtime (Netlify = UTC), y un
 *    alumno ve la clase 3-4 horas más tarde de lo real.
 *
 * 2. Columnas `date` (sin componente de hora: `cohorts.start_date`) NO son
 *    un instante — son un día calendario puro. `new Date("2026-06-20")` las
 *    interpreta como medianoche UTC; si luego se formatean con
 *    `timeZone: "America/Santiago"`, la resta de horas retrocede la fecha
 *    al día anterior. Para estas columnas la zona correcta es UTC (o un
 *    split de string), nunca Chile.
 *
 * Por eso hay DOS funciones de formateo y no una: usar la de Chile en una
 * columna `date`, o la de UTC en un `timestamptz`, produce el bug contrario
 * al que se intentaba arreglar. `Intl` ya resuelve la base IANA completa
 * (incluida la transición de horario de verano chilena, UTC-4 → UTC-3 el
 * primer domingo de septiembre) — no hace falta ninguna librería extra.
 */

export const TZ_CHILE = "America/Santiago";

/**
 * Formatea un instante (`timestamptz`, string ISO con offset o "Z") en la
 * zona horaria de Chile. Úsala SIEMPRE para `starts_at`, `ends_at`,
 * `unlock_at`, `opens_at`, `closes_at`, `due_at` y cualquier otro instante.
 */
export function formatChile(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-CL", { ...opts, timeZone: TZ_CHILE }).format(
    new Date(iso),
  );
}

/**
 * Formatea una columna `date` (sin componente de hora, ej. "2026-06-20").
 * Usa UTC a propósito — estas columnas no son un instante, son un día
 * calendario, y proyectarlas a Chile las retrocede un día. NO le pases un
 * `timestamptz` a esta función.
 */
export function formatDateOnly(dateStr: string, opts: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("es-CL", { ...opts, timeZone: "UTC" }).format(date);
}

/**
 * Devuelve el offset (en minutos) de la zona de Santiago para un instante
 * dado. Negativo = Santiago va detrás de UTC (ej. -240 = UTC-4 en invierno,
 * -180 = UTC-3 en verano).
 */
function santiagoOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_CHILE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return (asUtc - at.getTime()) / 60000;
}

/**
 * Convierte un ISO (UTC) al string `YYYY-MM-DDTHH:mm` que espera un input
 * `datetime-local`, expresado en hora de Santiago. Es una proyección directa
 * (formatear un instante ya conocido) y por lo tanto siempre exacta, sin
 * ambigüedad posible.
 */
export function isoToChileWallTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_CHILE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Interpreta un valor `datetime-local` (`YYYY-MM-DDTHH:mm`) como hora de
 * pared de Santiago y lo convierte al ISO UTC equivalente.
 *
 * Va en dos pasadas: la primera estima el offset tratando los componentes
 * como si fueran UTC; la segunda recalcula el offset sobre ese primer
 * resultado. Con una sola pasada, los minutos 01:00-04:00 del día de la
 * transición de horario (6-sep) pueden quedar desviados en 1 hora, porque
 * el offset usado para corregir se calculó en el instante equivocado. Con
 * dos pasadas el segundo offset converge al correcto y ese caso queda
 * cubierto. Chile no tiene clases de madrugada, así que en la práctica esto
 * es una capa de corrección adicional, no un fix de un bug observado.
 */
export function chileWallTimeToIso(local: string): string {
  const [datePart, timePart] = local.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);

  // Pasada 1: estimación tratando los componentes como UTC.
  const naiveUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offset1 = santiagoOffsetMinutes(new Date(naiveUtc));
  const estimate = naiveUtc - offset1 * 60000;

  // Pasada 2: recalcula el offset sobre la estimación de la pasada 1.
  const offset2 = santiagoOffsetMinutes(new Date(estimate));
  const final = naiveUtc - offset2 * 60000;

  return new Date(final).toISOString();
}
