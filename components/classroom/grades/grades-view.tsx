import { Check, AlertTriangle } from "lucide-react";
import { formatGrade, isPassing } from "@/lib/grades/scale";
import type { StudentGradesResult } from "@/lib/grades/queries";

/** Nota con ícono de aprobado/reprobado — no depende solo del color (H6). */
function GradeValue({ grade, size = 15 }: { grade: number; size?: number }) {
  const passing = isPassing(grade);
  return (
    <span
      className="inline-flex items-center gap-1 font-mono font-black"
      style={{ fontSize: size, color: passing ? "#3f5a05" : "#9f1b3e" }}
      aria-label={`Nota ${formatGrade(grade)}, ${passing ? "aprobada" : "reprobada"}`}
    >
      {passing ? <Check className="h-3.5 w-3.5" aria-hidden /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
      {formatGrade(grade)}
    </span>
  );
}

/**
 * Vista de notas consolidadas del alumno. Promedio por módulo sobre las
 * evaluaciones YA CALIFICADAS: ponderado si alguna tiene `weight_pct`
 * cargado (ej. metodología comercial: 25/50/25), simple en caso contrario.
 * En modo ponderado, las notas sin peso quedan excluidas del cálculo y la UI
 * lo indica explícitamente (ADR-0024, supersede A7 de ADR-0018).
 */

// Corrección A4 de la revisión: el único umbral de asistencia dicho por quien
// decide (Paola) es 80%, pero NO está confirmado como política vigente — el
// 85%/75% de `programs.min_attendance_pct` es un default dormido del seed. Se
// oculta el carril (el cálculo, ya corregido en A3, se mantiene intacto) para
// no publicar un veredicto autoritativo derivado de un número no confirmado.
// Reactivar en cuanto se confirme el umbral con la profe.
const SHOW_ATTENDANCE_REQUIREMENT = false;

export function GradesView({ data }: { data: StudentGradesResult }) {
  const hasAnyGrade = data.groups.some((g) => g.rows.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Carril de asistencia — visualmente separado, nunca afecta las notas. */}
      {SHOW_ATTENDANCE_REQUIREMENT && data.attendance.pct !== null && (
        <div className="ca-card flex items-center gap-3 border border-ca-ink/[0.08] px-4 py-3.5">
          <span
            className="shape-circle h-2.5 w-2.5 shrink-0"
            style={{
              background: data.attendance.meetsRequirement ? "var(--color-ca-lime)" : "#e11d48",
            }}
          />
          <p className="text-[13px] font-semibold text-ca-ink">
            Requisito de asistencia:{" "}
            {data.attendance.meetsRequirement ? "lo cumples" : "aún no lo cumples"}.{" "}
            <span className="font-normal text-ca-ink-soft">No afecta tus notas.</span>
          </p>
        </div>
      )}

      {!hasAnyGrade ? (
        <div className="ca-card flex flex-col items-center justify-center p-8 text-center md:p-16">
          <p className="text-[14px] font-bold text-ca-ink">Aún no tienes notas publicadas</p>
          <p className="mt-1 text-[13px] text-ca-ink-soft">
            Cuando tu profesor publique una calificación, aparecerá aquí.
          </p>
        </div>
      ) : (
        data.groups
          .filter((g) => g.rows.length > 0)
          .map((group) => (
            <section key={group.key} className="ca-card border border-ca-ink/[0.08] p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-black tracking-tight text-ca-ink">{group.title}</h2>
                {group.average !== null && (
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="flex items-baseline gap-1.5 rounded-full bg-ca-bg-soft px-3 py-1">
                      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft">
                        {group.averageKind === "weighted" ? "Promedio ponderado" : "Promedio de tus evaluaciones calificadas"}
                      </span>
                      <GradeValue grade={group.average} size={14} />
                    </div>
                    {group.averageKind === "weighted" && (
                      <p className="text-[11px] text-ca-ink-soft">
                        Calculado según el peso de cada evaluación
                        {group.averageExcluded > 0 &&
                          ` · ${group.averageExcluded} ${group.averageExcluded === 1 ? "evaluación no pondera" : "evaluaciones no ponderan"}`}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col divide-y" style={{ borderColor: "rgba(20,22,58,0.06)" }}>
                {group.rows.map((row) => (
                  <div key={row.evaluationId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-ca-ink">
                        {row.title}
                        {group.averageKind === "weighted" && (
                          <span className="ml-1.5 text-[11px] font-medium text-ca-ink-soft">
                            {row.weightPct != null ? `${row.weightPct}% del promedio` : "no pondera"}
                          </span>
                        )}
                      </p>
                      {row.feedback && <p className="mt-0.5 text-[12px] text-ca-ink-soft">{row.feedback}</p>}
                    </div>
                    <GradeValue grade={row.grade} />
                  </div>
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
