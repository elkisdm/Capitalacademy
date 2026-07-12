"use client";

import { useState } from "react";
import { Avatar } from "@/components/classroom/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  StudentToolbar,
  StudentRow,
  TwoPane,
  MetricCard,
  DetailSectionTitle,
} from "@/components/admin/students/shared";
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

function StudentDetail({ student, onClose }: { student: StudentPanelRow; onClose: () => void }) {
  return (
    <div className="flex max-h-[88vh] flex-col overflow-hidden lg:max-h-none">
      <div className="flex items-start justify-between border-b border-ca-ink/[0.08] p-5">
        <div className="flex items-center gap-4">
          <Avatar initials={student.initials} size={48} accent="bg-ca-lime" />
          <div>
            <h3 className="text-[18px] font-black tracking-tight text-ca-ink">{student.fullName}</h3>
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
          className="h-9 w-9 shrink-0 rounded-full p-0 lg:hidden"
        >
          <svg aria-hidden="true" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-6 grid grid-cols-3 gap-3">
          <MetricCard
            label="Asistencia"
            value={student.attendance.total === 0 ? "—" : `${student.attendance.pct}%`}
            sub={
              student.attendance.total === 0
                ? "Sin clases aplicables"
                : `${student.attendance.present} de ${student.attendance.total} sesiones`
            }
          />
          <MetricCard
            label="Avance"
            value={`${student.progress.pct}%`}
            sub={`${student.progress.completed} de ${student.progress.total} lecciones`}
          />
          <MetricCard
            label="Evaluaciones"
            value={
              <>
                {student.evaluations.approved}
                <span className="text-[14px] opacity-50">/{student.evaluations.total}</span>
              </>
            }
            sub="aprobadas"
          />
        </div>

        <DetailSectionTitle>Sesiones a las que faltó</DetailSectionTitle>
        {student.attendance.missed.length === 0 ? (
          <p className="mb-6 text-[13px] font-semibold text-ca-ink-soft">Sin inasistencias.</p>
        ) : (
          <div className="mb-6 flex flex-col gap-2">
            {student.attendance.missed.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-ca-ink/[0.08] p-3">
                <span className="min-w-0 truncate text-[13px] font-bold text-ca-ink">{s.title ?? "Clase en vivo"}</span>
                <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-ca-ink-soft">
                  {new Date(s.startsAt).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        )}

        <DetailSectionTitle>Lecciones pendientes</DetailSectionTitle>
        {student.progress.pending.length === 0 ? (
          <p className="mb-6 text-[13px] font-semibold text-ca-ink-soft">Sin lecciones pendientes.</p>
        ) : (
          <div className="mb-6 flex flex-col gap-2">
            {student.progress.pending.map((l, idx) => (
              <div key={idx} className="flex items-center justify-between rounded-xl border border-ca-ink/[0.08] p-3">
                <span className="text-[13px] font-bold text-ca-ink">{l.lessonTitle}</span>
                <span className="text-[11px] font-semibold text-ca-ink-soft">{l.moduleTitle}</span>
              </div>
            ))}
          </div>
        )}

        <DetailSectionTitle>Evaluaciones pendientes</DetailSectionTitle>
        {student.evaluations.pending.length === 0 ? (
          <p className="text-[13px] font-semibold text-ca-ink-soft">Sin evaluaciones pendientes.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {student.evaluations.pending.map((e, idx) => (
              <div key={idx} className="flex items-center justify-between rounded-xl border border-ca-ink/[0.08] p-3">
                <span className="text-[13px] font-bold text-ca-ink">{e.title}</span>
                <span className="text-[11px] font-semibold text-ca-ink-soft">{EVALUATION_SCOPE_LABEL(e.scope)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function StudentTable({ students }: { students: StudentPanelRow[] }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "at_risk" | "behind">("all");
  const [selected, setSelected] = useState<StudentPanelRow | null>(null);

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
      <StudentToolbar
        chips={[
          { id: "all", label: "Todos", count: students.length },
          { id: "at_risk", label: "En riesgo", count: atRiskCount },
          { id: "behind", label: "Atrasados", count: behindCount },
        ]}
        activeChip={filter}
        onChip={(id) => setFilter(id as "all" | "at_risk" | "behind")}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar por nombre o email…"
      />

      <TwoPane
        onClose={() => setSelected(null)}
        detail={selected ? <StudentDetail student={selected} onClose={() => setSelected(null)} /> : null}
        list={
          filtered.length === 0 ? (
            <EmptyState
              icon={UsersEmptyIcon}
              title="Sin alumnos en este filtro"
              description="Ajusta el filtro o la búsqueda para ver más resultados."
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map((s) => (
                <StudentRow
                  key={s.enrollmentId}
                  initials={s.initials}
                  name={s.fullName}
                  sub={`${s.email} · ${s.cohortName}`}
                  selected={selected?.enrollmentId === s.enrollmentId}
                  onSelect={() => setSelected(s)}
                  badge={s.atRisk && <Badge tone="destructive" size="sm">En riesgo</Badge>}
                >
                  <div className="text-right">
                    <div className="font-mono text-[13px] font-black text-ca-ink">
                      {s.attendance.total === 0 ? (
                        "Sin clases"
                      ) : (
                        <>
                          {s.attendance.present}/{s.attendance.total}
                          <span className="ml-1 text-[10px] font-semibold text-ca-ink-soft">
                            ({s.attendance.pct}%)
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft">
                      Asistencia
                    </div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div
                      className="font-mono text-[13px] font-black"
                      style={{ color: s.attendance.absences >= 2 ? "#9f1b3e" : "var(--color-ca-ink)" }}
                    >
                      {s.attendance.absences}
                    </div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft">
                      Inasistencias
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-black/[0.06]">
                        <div
                          className="h-full rounded-full bg-ca-ink-soft"
                          style={{ width: `${s.progress.pct}%`, opacity: 0.5 }}
                        />
                      </div>
                      <span className="font-mono text-[11px] font-bold text-ca-ink">{s.progress.pct}%</span>
                    </div>
                    <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft">
                      Avance
                    </div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="font-mono text-[13px] font-black text-ca-ink">
                      {s.evaluations.approved}/{s.evaluations.total}
                    </div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-ca-ink-soft">
                      Evaluaciones
                    </div>
                  </div>
                </StudentRow>
              ))}
            </div>
          )
        }
      />
    </>
  );
}
