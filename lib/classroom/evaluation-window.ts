/**
 * Estado de disponibilidad de una evaluación según `is_active` + la ventana
 * opcional `opens_at`/`closes_at` (migración 0070). Helper PURO (sin
 * `server-only`): sin dependencias de Supabase ni del entorno, para poder
 * testearlo con fechas fijas y reusarlo tanto en server components como en
 * route handlers.
 *
 * Regla (ver ADR-0016, D2/D5):
 *   - `is_active=false`            → "draft"     (borrador, staff-only)
 *   - `is_active=true` + antes de `opens_at`  → "scheduled"
 *   - `is_active=true` + después de `closes_at` → "closed"
 *   - en cualquier otro caso                     → "open"
 *
 * `opens_at`/`closes_at` NULL = sin límite en ese extremo (comportamiento
 * actual, sin ventana). Se usa `!ev.opens_at`/`!ev.closes_at` (falsy) en vez
 * de comparar contra `null` estricto: fixtures de tests o filas parciales
 * pueden traerlas como `undefined` en vez de `null`.
 */
export type EvaluationWindow = {
  is_active: boolean;
  opens_at?: string | null;
  closes_at?: string | null;
};

export type EvaluationState = "draft" | "scheduled" | "open" | "closed";

export function getEvaluationState(ev: EvaluationWindow, now: Date = new Date()): EvaluationState {
  if (!ev.is_active) return "draft";
  const nowMs = now.getTime();
  if (!ev.opens_at && !ev.closes_at) return "open";
  if (ev.opens_at && nowMs < new Date(ev.opens_at).getTime()) return "scheduled";
  if (ev.closes_at && nowMs > new Date(ev.closes_at).getTime()) return "closed";
  return "open";
}

/** Atajo: `true` solo cuando el estado es "open" (publicada y dentro de ventana). */
export function isEvaluationOpen(ev: EvaluationWindow, now: Date = new Date()): boolean {
  return getEvaluationState(ev, now) === "open";
}
