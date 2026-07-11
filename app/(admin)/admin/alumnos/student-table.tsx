"use client";

import { useState } from "react";
import { Avatar } from "@/components/classroom/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { StudentPanelRow } from "@/lib/admin/student-panel-queries";

function UsersEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
    </svg>
  );
}

function EVALUATION_SCOPE_LABEL(scope: string) {
  if (scope === "final") return "Examen final";
  if (scope === "module") return "Evaluación de módulo";
  if (scope === "lesson") return "Quiz de lección";
  if (scope === "session") return "Quiz de clase en vivo";
  return scope;
}

function DrillDownModal({ student, onClose }: { student: StudentPanelRow; onClose: () => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby="student-drilldown-title"
      className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden p-0"
    >
      <div className="relative flex items-start justify-between border-b border-ca-ink/[0.08] p-6">
        <div className="flex items-center gap-4">
          <Avatar initials={student.initials} size={56} accent="bg-ca-lime" />
          <div>
            <h3 id="student-drilldown-title" className="text-[22px] font-black tracking-tight text-ca-ink">
              {student.fullName}
            </h3>
            <div className="font-mono text-[11px] font-semibold text-ca-ink-soft">
              {student.email} · {student.cohortName}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Cerrar"
          className="h-10 w-10 rounded-full p-0"
        >
          <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </Button>
      </div>

      <div className="relative flex-1 overflow-y-auto p-6">
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="ca-card p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Asistencia</div>
            <div className="mt-1 font-mono text-[28px] font-black text-ca-ink">
              {student.attendance.total === 0 ? "—" : `${student.attendance.pct}%`}
            </div>
            <div className="text-[11px] font-semibold text-ca-ink-soft">
              {student.attendance.total === 0
                ? "Sin clases aplicables"
                : `${student.attendance.present} de ${student.attendance.total} sesiones`}
            </div>
          </div>
          <div className="ca-card p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Avance</div>
            <div className="mt-1 font-mono text-[28px] font-black text-ca-ink">
              {student.progress.pct}%
            </div>
            <div className="text-[11px] font-semibold text-ca-ink-soft">
              {student.progress.completed} de {student.progress.total} lecciones
            </div>
          </div>
          <div className="ca-card p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Evaluaciones</div>
            <div className="mt-1 font-mono text-[28px] font-black text-ca-ink">
              {student.evaluations.approved}
              <span className="text-[14px] opacity-50">/{student.evaluations.total}</span>
            </div>
            <div className="text-[11px] font-semibold text-ca-ink-soft">aprobadas</div>
          </div>
        </div>

        <div className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Sesiones a las que faltó
        </div>
        {student.attendance.missed.length === 0 ? (
          <p className="mb-6 text-[13px] font-semibold text-ca-ink-soft">Sin inasistencias.</p>
        ) : (
          <div className="mb-6 flex flex-col gap-2">
            {student.attendance.missed.map((s) => (
              <div key={s.id} className="ca-card flex items-center justify-between p-3">
                <span className="text-[13px] font-bold text-ca-ink">{s.title ?? "Clase en vivo"}</span>
                <span className="font-mono text-[11px] text-ca-ink-soft">
                  {new Date(s.startsAt).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Lecciones pendientes
        </div>
        {student.progress.pending.length === 0 ? (
          <p className="mb-6 text-[13px] font-semibold text-ca-ink-soft">Sin lecciones pendientes.</p>
        ) : (
          <div className="mb-6 flex flex-col gap-2">
            {student.progress.pending.map((l, idx) => (
              <div key={idx} className="ca-card flex items-center justify-between p-3">
                <span className="text-[13px] font-bold text-ca-ink">{l.lessonTitle}</span>
                <span className="text-[11px] font-semibold text-ca-ink-soft">{l.moduleTitle}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Evaluaciones pendientes
        </div>
        {student.evaluations.pending.length === 0 ? (
          <p className="text-[13px] font-semibold text-ca-ink-soft">Sin evaluaciones pendientes.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {student.evaluations.pending.map((e, idx) => (
              <div key={idx} className="ca-card flex items-center justify-between p-3">
                <span className="text-[13px] font-bold text-ca-ink">{e.title}</span>
                <span className="text-[11px] font-semibold text-ca-ink-soft">{EVALUATION_SCOPE_LABEL(e.scope)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function StudentTable({ students }: { students: StudentPanelRow[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "at_risk" | "behind">("all");
  const [drill, setDrill] = useState<StudentPanelRow | null>(null);

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    if (q && !s.fullName.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
    if (filter === "at_risk") return s.atRisk;
    if (filter === "behind") return s.progress.pct < 30;
    return true;
  });

  const atRiskCount = students.filter((s) => s.atRisk).length;
  const behindCount = students.filter((s) => s.progress.pct < 30).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { id: "all" as const, label: "Todos", count: students.length },
          { id: "at_risk" as const, label: "En riesgo", count: atRiskCount },
          { id: "behind" as const, label: "Atrasados", count: behindCount },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40"
            style={{
              background: filter === f.id ? "var(--color-ca-ink)" : "transparent",
              color: filter === f.id ? "#fff" : "var(--color-ca-ink-soft)",
              border: filter === f.id ? "1px solid var(--color-ca-ink)" : "1px solid rgba(20,22,58,0.14)",
            }}
          >
            {f.label}
            <span
              className="rounded-full px-1.5 text-[10px]"
              style={{
                background: filter === f.id ? "var(--color-ca-lime)" : "var(--color-ca-bg-soft)",
                color: "var(--color-ca-ink)",
              }}
            >
              {f.count}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 rounded-full bg-ca-bg-soft px-3 py-1.5">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            aria-label="Buscar alumno"
            placeholder="Buscar por nombre o email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 bg-transparent text-[12px] font-medium text-ca-ink outline-none"
          />
        </div>
      </div>

      {/* Desktop table */}
      {filtered.length === 0 ? (
        <div className="hidden md:block">
          <EmptyState
            icon={UsersEmptyIcon}
            title="Sin alumnos en este filtro"
            description="Ajusta el filtro o la búsqueda para ver más resultados."
          />
        </div>
      ) : (
      <div className="ca-card hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--color-ca-bg-soft)" }}>
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">Alumno</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">Asistencia</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">Inasistencias</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">Avance</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">Evaluaciones</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, idx) => {
                return (
                  <tr
                    key={s.enrollmentId}
                    onClick={() => setDrill(s)}
                    className="ca-fade-up ca-stagger cursor-pointer border-t border-ca-ink/[0.08] transition-colors hover:bg-ca-bg-soft"
                    style={{ "--i": idx } as React.CSSProperties}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar initials={s.initials} size={36} />
                        <div className="min-w-0">
                          <div className="text-[13px] font-bold text-ca-ink">{s.fullName}</div>
                          <div className="font-mono text-[10px] text-ca-ink-soft">{s.email} · {s.cohortName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.attendance.total === 0 ? (
                        <span className="font-mono text-[13px] font-black text-ca-ink-soft">Sin clases</span>
                      ) : (
                        <>
                          <span className="font-mono text-[13px] font-black text-ca-ink">
                            {s.attendance.present}/{s.attendance.total}
                          </span>
                          <span className="ml-1.5 text-[11px] font-semibold text-ca-ink-soft">({s.attendance.pct}%)</span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-[13px] font-black"
                        style={{ color: s.attendance.absences >= 2 ? "#9f1b3e" : "var(--color-ca-ink)" }}
                      >
                        {s.attendance.absences}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-black/[0.06]">
                          <div className="h-full rounded-full bg-ca-ink-soft" style={{ width: `${s.progress.pct}%`, opacity: 0.5 }} />
                        </div>
                        <span className="font-mono text-[12px] font-bold text-ca-ink">{s.progress.pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[13px] font-black text-ca-ink">
                        {s.evaluations.approved}/{s.evaluations.total}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.atRisk && (
                        <Badge tone="destructive" size="sm" className="uppercase tracking-[0.1em]">
                          En riesgo
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={UsersEmptyIcon}
            title="Sin alumnos en este filtro"
            description="Ajusta el filtro o la búsqueda para ver más resultados."
          />
        ) : (
          filtered.map((s) => {
            return (
              <button
                key={s.enrollmentId}
                onClick={() => setDrill(s)}
                className="ca-card w-full p-4 text-left transition-colors hover:bg-ca-bg-soft/60"
              >
                <div className="flex items-center gap-3">
                  <Avatar initials={s.initials} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-ca-ink">{s.fullName}</div>
                    <div className="font-mono text-[10px] text-ca-ink-soft">{s.email} · {s.cohortName}</div>
                  </div>
                  {s.atRisk && (
                    <Badge tone="destructive" size="sm" className="shrink-0 uppercase tracking-[0.1em]">
                      En riesgo
                    </Badge>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="font-mono text-[15px] font-black text-ca-ink">
                      {s.attendance.total === 0 ? "—" : `${s.attendance.present}/${s.attendance.total}`}
                    </div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft">Asistencia</div>
                  </div>
                  <div>
                    <div className="font-mono text-[15px] font-black text-ca-ink">{s.progress.pct}%</div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft">Avance</div>
                  </div>
                  <div>
                    <div className="font-mono text-[15px] font-black text-ca-ink">{s.evaluations.approved}/{s.evaluations.total}</div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft">Evaluaciones</div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {drill && <DrillDownModal student={drill} onClose={() => setDrill(null)} />}
    </>
  );
}
