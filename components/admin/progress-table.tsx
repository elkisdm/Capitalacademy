"use client";

import { useState } from "react";
import { Avatar } from "@/components/classroom/primitives";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  StudentToolbar,
  StudentRow,
  TwoPane,
  MetricCard,
  DetailSectionTitle,
} from "@/components/admin/students/shared";
import type { CohortStudentProgress } from "@/lib/classroom/admin-queries";

function progressTone(pct: number) {
  if (pct >= 90) return { fg: "#3f5a05", label: "completado" };
  if (pct >= 70) return { fg: "var(--color-ca-lime-deep)", label: "al día" };
  if (pct >= 30) return { fg: "var(--color-ca-amber-text)", label: "en progreso" };
  if (pct > 0) return { fg: "var(--color-ca-ink-soft)", label: "atrasado" };
  return { fg: "var(--color-ca-ink-soft)", label: "sin iniciar" };
}

function UsersEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
    </svg>
  );
}

function ProgressDetail({ student, onClose }: { student: CohortStudentProgress; onClose: () => void }) {
  return (
    <div className="flex max-h-[88vh] flex-col overflow-hidden lg:max-h-none">
      <div className="flex items-start justify-between border-b border-ca-ink/[0.08] p-5">
        <div className="flex items-center gap-4">
          <Avatar initials={student.initials} size={48} accent="bg-ca-lime" />
          <div>
            <h3 className="text-[18px] font-black tracking-tight text-ca-ink">{student.full_name}</h3>
            <div className="font-mono text-[11px] font-semibold text-ca-ink-soft">{student.email}</div>
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
          <MetricCard label="Progreso global" value={`${student.overall_percentage}%`} />
          <MetricCard
            label="Módulos completos"
            value={
              <>
                {student.module_progress.filter((m) => m.percentage >= 90).length}
                <span className="text-[14px] opacity-50">/{student.module_progress.length}</span>
              </>
            }
            tone="var(--color-ca-lime-deep)"
          />
          <MetricCard
            label="Última actividad"
            value={
              student.last_seen
                ? new Date(student.last_seen).toLocaleDateString("es-CL", { day: "numeric", month: "short" })
                : "Sin actividad"
            }
          />
        </div>

        <DetailSectionTitle>Lecciones por módulo</DetailSectionTitle>
        <div className="flex flex-col gap-3">
          {student.module_progress.map((mp) => {
            const tone = progressTone(mp.percentage);
            return (
              <div key={mp.module_id} className="ca-card p-4">
                <div className="flex items-center gap-3">
                  <div className="font-mono text-[12px] font-bold text-ca-ink-soft">
                    M{String(mp.module_position).padStart(2, "0")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-extrabold tracking-tight text-ca-ink">{mp.module_title}</div>
                    <div className="text-[11px] font-semibold text-ca-ink-soft">
                      {mp.completed_lessons} de {mp.total_lessons} lecciones
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[18px] font-black" style={{ color: tone.fg }}>{mp.percentage}%</div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: tone.fg, opacity: 0.8 }}>{tone.label}</div>
                  </div>
                </div>
                <div className="mt-3 flex gap-1">
                  {Array.from({ length: mp.total_lessons }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-2 flex-1 rounded-full"
                      style={{
                        background: idx < mp.completed_lessons
                          ? "var(--color-ca-lime-deep)"
                          : "var(--color-ca-outline, rgba(20,22,58,0.08))",
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type ProgressTableProps = {
  students: CohortStudentProgress[];
};

export function ProgressTable({ students }: ProgressTableProps) {
  const [selected, setSelected] = useState<CohortStudentProgress | null>(null);
  const [filter, setFilter] = useState<"all" | "behind" | "on_track" | "complete">("all");
  const [search, setSearch] = useState("");

  const filtered = students.filter((s) => {
    if (search && !s.full_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "behind") return s.overall_percentage < 30;
    if (filter === "on_track") return s.overall_percentage >= 30 && s.overall_percentage < 90;
    if (filter === "complete") return s.overall_percentage >= 90;
    return true;
  });

  const behind = students.filter((s) => s.overall_percentage < 30).length;
  const complete = students.filter((s) => s.overall_percentage >= 90).length;
  const onTrack = students.filter((s) => s.overall_percentage >= 30 && s.overall_percentage < 90).length;

  return (
    <>
      <StudentToolbar
        chips={[
          { id: "all", label: "Todos", count: students.length },
          { id: "complete", label: "Certificables", count: complete },
          { id: "on_track", label: "Al día", count: onTrack },
          { id: "behind", label: "En riesgo", count: behind },
        ]}
        activeChip={filter}
        onChip={(id) => setFilter(id as "all" | "behind" | "on_track" | "complete")}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Buscar alumno…"
      />

      <TwoPane
        onClose={() => setSelected(null)}
        detail={selected ? <ProgressDetail student={selected} onClose={() => setSelected(null)} /> : null}
        list={
          <div className="flex flex-col gap-3">
            {filtered.length === 0 ? (
              <EmptyState
                icon={UsersEmptyIcon}
                title="Sin alumnos en este filtro"
                description="Ajusta el filtro para ver más resultados."
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                {filtered.map((s) => {
                  const tone = progressTone(s.overall_percentage);
                  return (
                    <StudentRow
                      key={s.student_id}
                      initials={s.initials}
                      name={s.full_name}
                      sub={s.email}
                      selected={selected?.student_id === s.student_id}
                      onSelect={() => setSelected(s)}
                    >
                      <div className="hidden w-28 gap-0.5 sm:flex">
                        {s.module_progress.map((mp) => (
                          <div
                            key={mp.module_id}
                            className="h-2 flex-1 rounded-sm"
                            style={{ background: progressTone(mp.percentage).fg, opacity: 0.75 }}
                          />
                        ))}
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[18px] font-black" style={{ color: tone.fg }}>
                          {s.overall_percentage}%
                        </div>
                        <div
                          className="text-[9px] font-bold uppercase tracking-[0.1em]"
                          style={{ color: tone.fg, opacity: 0.8 }}
                        >
                          {tone.label}
                        </div>
                      </div>
                    </StudentRow>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-ca-ink-soft">
              {filtered.length > 0 && (
                <>
                  <span>Selecciona un alumno para ver el detalle</span>
                  <span className="opacity-30">·</span>
                </>
              )}
              {([
                [90, "Completado"],
                [70, "Al día"],
                [30, "En progreso"],
                [10, "Atrasado"],
                [0, "Sin iniciar"],
              ] as const).map(([p, l]) => {
                const t = progressTone(p);
                return (
                  <span key={l} className="inline-flex items-center gap-1.5">
                    <span className="shape-circle h-2.5 w-2.5" style={{ background: t.fg, opacity: 0.7 }} />
                    {l}
                  </span>
                );
              })}
            </div>
          </div>
        }
      />
    </>
  );
}
