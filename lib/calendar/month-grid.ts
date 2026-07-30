/**
 * Construcción de la grilla de un mes de calendario.
 *
 * Vive en `lib/` y no dentro del componente porque es la lógica que se rompió:
 * las celdas de relleno (los días del mes vecino que completan la primera y la
 * última semana) tenían dayKey real y eran clickeables, pero se les vaciaban las
 * sesiones. El resultado era que el mismo día salía vacío en la grilla y con
 * clases en el panel de detalle. Acá es una función pura, así que el contrato
 * queda fijado por tests (el proyecto no puede renderizar componentes: no tiene
 * jsdom ni @testing-library, ver el comentario de `vitest.config.ts`).
 */

export const TZ_SANTIAGO = "America/Santiago";

/** Forma mínima que la grilla necesita de cada sesión. */
export type CalendarEventLike = {
  id: string;
  starts_at: string;
};

export type MonthCell<T> = {
  /** Día calendario YYYY-MM-DD. Siempre el real, también en las celdas de relleno. */
  key: string;
  /** Número de día del mes al que pertenece la celda. */
  day: number;
  /** false en los días del mes vecino que completan la semana. */
  inMonth: boolean;
  /** Sesiones de ese día, ordenadas por hora de inicio. */
  sessions: T[];
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Día calendario (YYYY-MM-DD) de un instante, en la zona indicada. */
export function dayKeyOf(iso: string, tz: string = TZ_SANTIAGO): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Agrupa sesiones por día calendario, cada grupo ordenado por hora de inicio. */
export function groupByDay<T extends CalendarEventLike>(
  sessions: T[],
  tz: string = TZ_SANTIAGO,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const s of sessions) {
    const key = dayKeyOf(s.starts_at, tz);
    const arr = map.get(key);
    if (arr) arr.push(s);
    else map.set(key, [s]);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }
  return map;
}

/**
 * Celdas del mes `month` (0-11) del año `year`, en semanas que empiezan el lunes,
 * con las sesiones de cada día ya resueltas.
 *
 * Las celdas de relleno traen sus propias sesiones: un calendario mensual muestra
 * los eventos de los días vecinos que aparecen en la grilla (igual que Google
 * Calendar). Quien renderiza puede atenuarlas visualmente con `inMonth`, pero el
 * dato no se esconde.
 */
export function buildMonthCells<T extends CalendarEventLike>(
  year: number,
  month: number,
  sessions: T[],
  tz: string = TZ_SANTIAGO,
): MonthCell<T>[] {
  const byDay = groupByDay(sessions, tz);

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=domingo
  const lead = (firstDow + 6) % 7; // lunes primero

  const cells: MonthCell<T>[] = [];
  const push = (key: string, day: number, inMonth: boolean) =>
    cells.push({ key, day, inMonth, sessions: byDay.get(key) ?? [] });

  // Relleno del mes anterior.
  const prevDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  for (let i = lead - 1; i >= 0; i--) {
    const d = prevDays - i;
    push(`${prevYear}-${pad(prevMonth + 1)}-${pad(d)}`, d, false);
  }

  // Días del mes.
  for (let d = 1; d <= daysInMonth; d++) {
    push(`${year}-${pad(month + 1)}-${pad(d)}`, d, true);
  }

  // Relleno del mes siguiente hasta completar la última semana.
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  let d = 1;
  while (cells.length % 7 !== 0) {
    push(`${nextYear}-${pad(nextMonth + 1)}-${pad(d)}`, d, false);
    d++;
  }

  return cells;
}

/** Parte las celdas en filas de 7 (semanas). */
export function toWeeks<T>(cells: MonthCell<T>[]): MonthCell<T>[][] {
  const rows: MonthCell<T>[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}
