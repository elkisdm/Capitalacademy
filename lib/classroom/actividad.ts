/**
 * Métricas de actividad del alumno — lógica pura (ADR-0029).
 *
 * Este archivo NO toca la base ni el DOM: concentra el corte de día, el
 * recorte del latido y el formateo, para que el endpoint, el hook de cliente y
 * el panel del admin compartan una sola definición de cada cosa.
 *
 * Lo que se mide es TIEMPO CON LA PLATAFORMA ABIERTA Y VISIBLE. No son "horas
 * de estudio": el alumno pudo tener la pestaña al frente sin leer, o estudiar
 * con material descargado sin sumar un segundo acá. Los rótulos de la interfaz
 * tienen que decirlo así (ADR-0029, riesgos).
 */

import { isoToChileWallTime } from "@/lib/time";

/**
 * Cada cuánto late el cliente. 60 s es el equilibrio entre resolución del dato
 * (el error máximo por sesión es un intervalo) y tráfico de escritura.
 */
export const ACTIVITY_BEAT_INTERVAL_MS = 60_000;

/**
 * Tope de segundos que un solo latido puede acreditar. Es el doble del
 * intervalo, así un latido demorado por jitter de red o por throttling de la
 * pestaña sigue contando completo, pero una pestaña que estuvo dormida una hora
 * acredita 120 s y no 3.600.
 *
 * Es también el blindaje anti-inflado: el cuerpo del POST no lleva segundos, y
 * como el incremento se deriva en la base contra `last_beat_at`, latir más
 * seguido NO suma más tiempo y un latido reenviado por reintento acredita ~0.
 */
export const ACTIVITY_MAX_GAP_SECONDS = 120;

/**
 * Día calendario de Chile ("YYYY-MM-DD") para un instante dado.
 *
 * Reusa `isoToChileWallTime` de lib/time.ts en vez de armar otro
 * `Intl.DateTimeFormat`: esa función ya resuelve la base IANA completa,
 * incluida la transición de horario de verano chilena (UTC-4 → UTC-3).
 *
 * El resultado es una columna `date` pura, no un instante — al mostrarla hay
 * que usar `formatDateOnly`, nunca `formatChile` (ver encabezado de lib/time.ts).
 */
export function chileDateKey(at: Date = new Date()): string {
  return isoToChileWallTime(at.toISOString()).slice(0, 10);
}

/**
 * Días calendario entre dos claves "YYYY-MM-DD". Aritmética en UTC a propósito:
 * las claves ya vienen proyectadas a Chile, así que acá solo se restan días.
 * Devuelve null si alguna clave es inválida.
 */
export function daysBetweenDateKeys(from: string, to: string): number | null {
  const a = dateKeyToUtcMs(from);
  const b = dateKeyToUtcMs(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}

function dateKeyToUtcMs(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Clave del día de Chile desplazada `days` días hacia atrás. Se usa para el
 * límite inferior del rango que consulta el panel.
 */
export function shiftDateKey(key: string, days: number): string {
  const ms = dateKeyToUtcMs(key);
  if (ms === null) return key;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Formatea una duración en segundos para la interfaz: "2 h 15 min", "45 min",
 * "< 1 min". Devuelve "—" cuando no hay actividad registrada, que es distinto
 * de cero: significa que nunca se vio a esta persona conectada.
 */
export function formatActiveDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.floor(seconds));
  if (total === 0) return "—";
  if (total < 60) return "< 1 min";

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/**
 * Rótulo de inactividad a partir de los días transcurridos desde el último
 * latido. `null` = nunca se conectó desde que existe la métrica.
 */
export function formatInactivity(daysSince: number | null): string {
  if (daysSince === null) return "Nunca";
  if (daysSince <= 0) return "Hoy";
  if (daysSince === 1) return "Ayer";
  return `Hace ${daysSince} días`;
}

/**
 * Severidad de la inactividad, para pintar la fila. Los cortes son los mismos
 * que usa el panel de progreso para "en riesgo": una semana sin aparecer es
 * señal de alerta, dos son motivo de contacto.
 */
export type ActivityRiskLevel = "ok" | "watch" | "risk";

export function activityRiskLevel(daysSince: number | null): ActivityRiskLevel {
  if (daysSince === null) return "risk";
  if (daysSince >= 14) return "risk";
  if (daysSince >= 7) return "watch";
  return "ok";
}
