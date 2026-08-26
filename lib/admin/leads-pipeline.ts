/**
 * El embudo de captación: etapas del lead y vencimiento de sus tareas.
 *
 * Puro y sin Supabase a propósito — acá vive la única definición de qué etapas
 * existen y de cuándo una tarea está vencida, y las tres pantallas que lo
 * necesitan (panel, franja de pendientes, digest por correo) la comparten en
 * vez de reimplementarla cada una con su propio corte de fecha.
 */

import { TZ_CHILE } from "@/lib/time";

// -----------------------------------------------------------------------------
// Etapas
// -----------------------------------------------------------------------------

/**
 * El orden ES el del embudo: así se ordenan los chips del panel y las columnas
 * de cualquier vista futura, sin una tabla de posiciones aparte.
 *
 * `matriculado` y `descartado` son ambas terminales. No hay obligación de pasar
 * por todas: un lead que compra el mismo día salta de `nuevo` a `matriculado`.
 */
export const LEAD_STAGES = [
  "nuevo",
  "contactado",
  "interesado",
  "matriculado",
  "descartado",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  nuevo: "Nuevo",
  contactado: "Contactado",
  interesado: "Interesado",
  matriculado: "Matriculado",
  descartado: "Descartado",
};

/** Etapas de las que ya no se espera gestión: no cuentan como embudo activo. */
export const LEAD_STAGES_TERMINALES: readonly LeadStage[] = [
  "matriculado",
  "descartado",
];

export function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === "string" && (LEAD_STAGES as readonly string[]).includes(value);
}

/**
 * Etapa de una fila que viene de la base.
 *
 * Cae a `nuevo` ante cualquier valor inesperado en vez de reventar: la columna
 * tiene CHECK y default, así que un valor fuera de la lista solo puede venir de
 * un dato escrito a mano en SQL, y en ese caso es mejor mostrar el lead en el
 * embudo que dejar la pantalla en blanco.
 */
export function toLeadStage(value: unknown): LeadStage {
  return isLeadStage(value) ? value : "nuevo";
}

export function isTerminalStage(stage: LeadStage): boolean {
  return LEAD_STAGES_TERMINALES.includes(stage);
}

/** Texto del `stage_change` que queda en la bitácora: "Nuevo → Contactado". */
export function describeStageChange(from: LeadStage, to: LeadStage): string {
  return `${LEAD_STAGE_LABELS[from]} → ${LEAD_STAGE_LABELS[to]}`;
}

// -----------------------------------------------------------------------------
// Tipos de contacto
// -----------------------------------------------------------------------------

export const LEAD_ACTIVITY_KINDS = [
  "note",
  "call",
  "email",
  "whatsapp",
  "stage_change",
] as const;

export type LeadActivityKind = (typeof LEAD_ACTIVITY_KINDS)[number];

export const LEAD_ACTIVITY_LABELS: Record<LeadActivityKind, string> = {
  note: "Nota",
  call: "Llamada",
  email: "Correo",
  whatsapp: "WhatsApp",
  stage_change: "Cambio de etapa",
};

/** Resultados posibles de una llamada. Solo aplican a `kind: "call"`. */
export const LEAD_CALL_OUTCOMES = ["answered", "no_answer", "wrong_number"] as const;

export type LeadCallOutcome = (typeof LEAD_CALL_OUTCOMES)[number];

export const LEAD_CALL_OUTCOME_LABELS: Record<LeadCallOutcome, string> = {
  answered: "Contestó",
  no_answer: "No contestó",
  wrong_number: "Número equivocado",
};

/**
 * Los tipos que cuentan como "hablé con esta persona".
 *
 * `stage_change` queda fuera porque mover una ficha de columna no es haber
 * contactado a nadie: si contara, un lead al que solo se le cambió la etapa
 * aparecería como contactado hoy y nunca volvería a la lista de pendientes.
 */
const KINDS_DE_CONTACTO: readonly LeadActivityKind[] = [
  "note",
  "call",
  "email",
  "whatsapp",
];

export function esContacto(kind: LeadActivityKind): boolean {
  return KINDS_DE_CONTACTO.includes(kind);
}

/**
 * Fecha del último contacto real de una lista de actividad, o null si solo hubo
 * cambios de etapa (o nada). No asume orden: recorre y se queda con la mayor.
 */
export function ultimoContacto(
  activity: readonly { kind: LeadActivityKind; created_at: string }[],
): string | null {
  let masReciente: string | null = null;
  let masRecienteMs = -Infinity;

  for (const a of activity) {
    if (!esContacto(a.kind)) continue;
    const ms = new Date(a.created_at).getTime();
    if (Number.isNaN(ms) || ms <= masRecienteMs) continue;
    masRecienteMs = ms;
    masReciente = a.created_at;
  }

  return masReciente;
}

// -----------------------------------------------------------------------------
// Vencimiento de tareas
// -----------------------------------------------------------------------------

export type TaskUrgency = "vencida" | "hoy" | "proxima";

const diaFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ_CHILE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** El día calendario chileno de un instante, como "2026-08-26". */
export function diaChile(instante: Date): string {
  return diaFormatter.format(instante);
}

/**
 * Cuán urgente es una tarea, comparando DÍAS CALENDARIO de Chile y no horas.
 *
 * Es la distinción que importa: una tarea de hoy a las 09:00 mirada a las 15:00
 * técnicamente "ya pasó", pero llamarla vencida es ruido — sigue siendo la
 * tarea de hoy y la persona la está mirando el mismo día. Vencida es la de
 * ayer o antes. El corte va en hora de Chile porque el día laboral es el de
 * quien gestiona, no el UTC del servidor.
 */
export function urgenciaDeTarea(dueAtIso: string, ahora: Date = new Date()): TaskUrgency {
  const due = new Date(dueAtIso);
  // Una fecha ilegible se trata como próxima: no inventa una alarma a partir de
  // un dato roto.
  if (Number.isNaN(due.getTime())) return "proxima";

  const diaDue = diaChile(due);
  const diaHoy = diaChile(ahora);

  if (diaDue === diaHoy) return "hoy";
  return diaDue < diaHoy ? "vencida" : "proxima";
}

export function estaPendiente(task: { done_at: string | null }): boolean {
  return task.done_at === null;
}

/**
 * Las tareas que hay que avisar: pendientes y vencidas o de hoy.
 *
 * Es exactamente el conjunto que muestra la franja del panel y el que sale en
 * el correo diario — una sola definición para que la pantalla y el correo nunca
 * digan cosas distintas. Salen ordenadas por vencimiento, lo más atrasado
 * primero.
 */
export function tareasPorAvisar<T extends { due_at: string; done_at: string | null }>(
  tasks: readonly T[],
  ahora: Date = new Date(),
): (T & { urgency: Exclude<TaskUrgency, "proxima"> })[] {
  return tasks
    .filter(estaPendiente)
    .map((t) => ({ ...t, urgency: urgenciaDeTarea(t.due_at, ahora) }))
    .filter(
      (t): t is T & { urgency: Exclude<TaskUrgency, "proxima"> } =>
        t.urgency !== "proxima",
    )
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
}
