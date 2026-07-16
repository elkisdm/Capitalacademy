import type { EvaluationKind, EvaluationScope } from "@/components/admin/quiz/types";

/**
 * Helper puro (sin Supabase, sin `server-only`) para la sección de primer
 * nivel "Evaluaciones" (`/admin/evaluaciones`). Espeja el patrón de
 * `lib/classroom/evaluation-window.ts`: sin dependencias externas, testeable
 * con fixtures fijas y reusable tanto en el server component (Paso 2) como
 * en el modal de creación (Paso 3).
 */
export type EvaluationRow = {
  id: string;
  scope: EvaluationScope;
  kind: EvaluationKind;
  title: string;
  is_active: boolean;
  opens_at: string | null;
  closes_at: string | null;
  weight_pct: number | null;
  questionCount: number;
  /** Módulo al que pertenece la evaluación (directo en scope='module', vía
   *  lección/sesión en scope='lesson'/'session', `null` en 'final' y en las
   *  sesiones sin módulo asignado). */
  moduleId: string | null;
  moduleTitle: string | null;
  /** id crudo de la lección/sesión, si aplica — lo usa `creationBlockers`
   *  para saber qué targets ya están tomados. */
  lessonId: string | null;
  sessionId: string | null;
  /** "Lección: X" | "Clase del 12 jul, 19:00" | null (final/módulo). */
  targetLabel: string | null;
};

export type EvaluationGroup = {
  key: string;
  title: string;
  rows: EvaluationRow[];
  /** `null` si ninguna fila del grupo define `weight_pct`; si no, la suma. */
  weightTotal: number | null;
};

function buildGroup(key: string, title: string, rows: EvaluationRow[]): EvaluationGroup {
  const weights = rows.map((r) => r.weight_pct).filter((w): w is number => w != null);
  const weightTotal = weights.length > 0 ? weights.reduce((a, b) => a + b, 0) : null;
  return { key, title, rows, weightTotal };
}

/**
 * Agrupa las evaluaciones: "Evaluación final" primero (si existe), luego un
 * grupo por módulo en el orden de `moduleOrder` (solo los módulos con al
 * menos una evaluación — con 9 evaluaciones en toda la plataforma no hace
 * falta mostrar módulos vacíos), y "Otras evaluaciones" al final para las
 * sesiones sin módulo asignado (`class_sessions.module_id` nullable).
 */
export function groupEvaluations(rows: EvaluationRow[], moduleOrder: string[]): EvaluationGroup[] {
  const groups: EvaluationGroup[] = [];

  const finalRows = rows.filter((r) => r.scope === "final");
  if (finalRows.length > 0) {
    groups.push(buildGroup("final", "Evaluación final", finalRows));
  }

  for (const moduleId of moduleOrder) {
    const moduleRows = rows.filter((r) => r.scope !== "final" && r.moduleId === moduleId);
    if (moduleRows.length === 0) continue;
    const title = moduleRows[0].moduleTitle ?? "Módulo";
    groups.push(buildGroup(moduleId, title, moduleRows));
  }

  const otherRows = rows.filter((r) => r.scope !== "final" && !r.moduleId);
  if (otherRows.length > 0) {
    groups.push(buildGroup("other", "Otras evaluaciones", otherRows));
  }

  return groups;
}

export function scopeLabel(scope: EvaluationScope): string {
  switch (scope) {
    case "final":
      return "Final del programa";
    case "module":
      return "Del módulo";
    case "lesson":
      return "De la lección";
    case "session":
      return "De la clase en vivo";
  }
}

export function kindLabel(kind: EvaluationKind): string {
  return kind === "quiz" ? "Quiz" : "Nota manual";
}

/**
 * Qué se puede crear, dado lo que ya existe. Alimenta el modal de creación
 * (deshabilita opciones que chocarían con un índice único de 0033/0040/0072):
 *   - `evaluations_one_final_per_program`: una sola final por programa, activa o no.
 *   - `evaluations_one_active_per_lesson`/`..._per_session`: a lo sumo una
 *     evaluación ACTIVA por lección/sesión — pero como crear un segundo
 *     borrador ahí nunca podría activarse, se bloquea con cualquier
 *     evaluación existente (activa o no), no solo las activas.
 *   - `evaluations_one_active_per_module`: a lo sumo un quiz ACTIVO por
 *     módulo (0072 acotó el índice a `kind='quiz'`) — mismo razonamiento que
 *     lección/sesión: un segundo quiz ahí nunca podría activarse, se bloquea
 *     con cualquier quiz existente (activo o no). Las notas manuales de
 *     módulo NO se bloquean (el módulo práctico admite varias a la vez).
 */
export function creationBlockers(
  existing: Pick<EvaluationRow, "scope" | "kind" | "moduleId" | "lessonId" | "sessionId">[],
): {
  finalTaken: boolean;
  moduleQuizzesTaken: Set<string>;
  lessonsTaken: Set<string>;
  sessionsTaken: Set<string>;
} {
  const finalTaken = existing.some((e) => e.scope === "final");
  const moduleQuizzesTaken = new Set(
    existing
      .filter((e) => e.scope === "module" && e.kind === "quiz" && e.moduleId)
      .map((e) => e.moduleId as string),
  );
  const lessonsTaken = new Set(
    existing.filter((e) => e.scope === "lesson" && e.lessonId).map((e) => e.lessonId as string),
  );
  const sessionsTaken = new Set(
    existing.filter((e) => e.scope === "session" && e.sessionId).map((e) => e.sessionId as string),
  );
  return { finalTaken, moduleQuizzesTaken, lessonsTaken, sessionsTaken };
}
