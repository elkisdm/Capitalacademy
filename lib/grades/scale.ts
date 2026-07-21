/**
 * Escala chilena 1-7. Brief: docs/briefs/evaluaciones-y-notas-1-7.md, ADR-0018.
 *
 * Fórmula lineal estándar (mín 1.0, aprobación 4.0 en la exigencia, máx 7.0):
 *   pct <  E:  nota = 1 + 3 * (pct / E)
 *   pct >= E:  nota = 4 + 3 * ((pct - E) / (100 - E))
 *
 * `E` (exigencia, `programs.grade_exigencia_pct`) es un parámetro DISTINTO de
 * `evaluations.passing_grade_pct` (umbral de `passed` booleano del quiz — otro
 * eje). Con exigencia 60 reproduce EXACTO los dos datapoints del Excel de
 * Camila: 90% → 6.3, 80% → 5.5 (ver brief, §0.2 y corrección A5).
 *
 * Función TS única, sin función SQL, sin tabla de escala: la nota se
 * ALMACENA (no se deriva) en `evaluation_grades.grade` — registro académico
 * = snapshot inmutable, calculado una vez al momento de calificar.
 */

export const DEFAULT_EXIGENCIA_PCT = 60;
export const DEFAULT_PASSING_GRADE = 4.0;

/** Redondea a 1 decimal (el formato de la nota chilena). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Convierte un porcentaje (0-100) a nota 1-7 según la exigencia dada.
 * Clampa el porcentaje a [0, 100] antes de calcular.
 */
export function pctToGrade(pct: number, exigenciaPct: number = DEFAULT_EXIGENCIA_PCT): number {
  const p = Math.min(100, Math.max(0, pct));
  const e = exigenciaPct;
  const grade = p < e ? 1 + 3 * (p / e) : 4 + 3 * ((p - e) / (100 - e));
  return round1(Math.min(7, Math.max(1, grade)));
}

/** Inversa de `pctToGrade`: qué porcentaje corresponde a una nota dada. */
export function gradeToPct(grade: number, exigenciaPct: number = DEFAULT_EXIGENCIA_PCT): number {
  const g = Math.min(7, Math.max(1, grade));
  const e = exigenciaPct;
  const pct = g < 4 ? ((g - 1) / 3) * e : e + ((g - 4) / 3) * (100 - e);
  return Math.round(Math.min(100, Math.max(0, pct)));
}

/** Formato es-CL: coma decimal (ej. 6.3 → "6,3"). */
export function formatGrade(grade: number | null | undefined): string {
  if (grade == null) return "—";
  return round1(grade).toFixed(1).replace(".", ",");
}

/** `true` si la nota alcanza el mínimo de aprobación (default 4.0). */
export function isPassing(grade: number, minGrade: number = DEFAULT_PASSING_GRADE): boolean {
  return grade >= minGrade;
}

/** Promedio simple (sin ponderar) de un conjunto de notas, redondeado a 1 decimal. */
export function averageGrade(grades: number[]): number | null {
  if (grades.length === 0) return null;
  const sum = grades.reduce((acc, g) => acc + g, 0);
  return round1(sum / grades.length);
}

export type GroupAverage = {
  value: number | null;
  kind: "weighted" | "simple" | null;
  counted: number;
  excluded: number;
};

/**
 * Promedio de un grupo de evaluaciones YA CALIFICADAS.
 * Si alguna tiene `weightPct`, se pondera SOLO sobre esas, normalizando por
 * la suma de SUS pesos: Σ(nota × peso) / Σ(peso). Normalizar (en vez de
 * dividir por 100) preserva el criterio de "promedio de lo ya calificado"
 * y hace que pesos que no suman 100 den un resultado correcto igual.
 * Las notas sin peso quedan EXCLUIDAS del ponderado (ADR-0024): el peso
 * parcial es un estado legítimo (ver lib/admin/evaluation-list.ts) y el
 * fallback a promedio simple destruiría la composición ya comunicada.
 * La UI DEBE informar `excluded > 0`.
 */
export function computeGroupAverage(
  rows: Array<{ grade: number; weightPct: number | null }>,
): GroupAverage {
  if (rows.length === 0) return { value: null, kind: null, counted: 0, excluded: 0 };
  const weighted = rows.filter((r) => r.weightPct != null && r.weightPct > 0);
  if (weighted.length === 0) {
    return { value: round1(rows.reduce((s, r) => s + r.grade, 0) / rows.length), kind: "simple", counted: rows.length, excluded: 0 };
  }
  const weightSum = weighted.reduce((s, r) => s + r.weightPct!, 0);
  if (weightSum <= 0) {
    return { value: round1(rows.reduce((s, r) => s + r.grade, 0) / rows.length), kind: "simple", counted: rows.length, excluded: 0 };
  }
  const weightedSum = weighted.reduce((s, r) => s + r.grade * r.weightPct!, 0);
  return { value: round1(weightedSum / weightSum), kind: "weighted", counted: weighted.length, excluded: rows.length - weighted.length };
}
