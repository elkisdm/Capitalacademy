import { formatGrade, isPassing } from "@/lib/grades/scale";
import type { StudentGradesResult } from "@/lib/grades/queries";

/**
 * Vista de notas consolidadas del alumno. Promedio SIMPLE (sin ponderar) por
 * módulo, salvo que el módulo tenga evaluaciones con `weight_pct` cargado
 * (ej. metodología comercial: 25/50/25) — ahí se listan solo las notas
 * individuales, sin promedio, para no mostrar un número que contradiga la
 * composición ya comunicada por la profe (corrección A7 del brief).
 */
export function GradesView({ data }: { data: StudentGradesResult }) {
  const hasAnyGrade = data.groups.some((g) => g.rows.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Carril de asistencia — visualmente separado, nunca afecta las notas. */}
      {data.attendance.pct !== null && (
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
                  <div className="flex items-baseline gap-1.5 rounded-full bg-ca-bg-soft px-3 py-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft">
                      Promedio de tus evaluaciones calificadas
                    </span>
                    <span
                      className="font-mono text-[14px] font-black"
                      style={{ color: isPassing(group.average) ? "#3f5a05" : "#9f1b3e" }}
                    >
                      {formatGrade(group.average)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col divide-y" style={{ borderColor: "rgba(20,22,58,0.06)" }}>
                {group.rows.map((row) => (
                  <div key={row.evaluationId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-ca-ink">{row.title}</p>
                      {row.feedback && <p className="mt-0.5 text-[12px] text-ca-ink-soft">{row.feedback}</p>}
                    </div>
                    <span
                      className="font-mono text-[15px] font-black"
                      style={{ color: isPassing(row.grade) ? "#3f5a05" : "#9f1b3e" }}
                    >
                      {formatGrade(row.grade)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
