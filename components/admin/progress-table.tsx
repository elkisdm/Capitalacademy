"use client";

import { useState } from "react";
import { Avatar } from "@/components/classroom/primitives";
import type { CohortStudentProgress } from "@/lib/classroom/admin-queries";

function progressTone(pct: number) {
  if (pct >= 90) return { bg: "rgba(168,211,16,0.22)", fg: "#3f5a05", label: "completado" };
  if (pct >= 70) return { bg: "rgba(168,211,16,0.16)", fg: "#3f5a05", label: "al día" };
  if (pct >= 30) return { bg: "rgba(255,196,0,0.18)", fg: "#7a5000", label: "en progreso" };
  if (pct > 0) return { bg: "rgba(225,29,72,0.12)", fg: "#9f1b3e", label: "atrasado" };
  return { bg: "rgba(20,22,58,0.05)", fg: "var(--color-ca-ink-soft)", label: "sin iniciar" };
}

function ProgressCell({ pct, onClick }: { pct: number; onClick: () => void }) {
  const tone = progressTone(pct);
  return (
    <button
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-xl px-3 py-2.5 text-left transition-transform hover:scale-[1.02]"
      style={{ background: tone.bg }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[15px] font-black tabular-nums" style={{ color: tone.fg }}>{pct}%</span>
        <span className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: tone.fg, opacity: 0.8 }}>{tone.label}</span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/10">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone.fg, opacity: 0.7 }} />
      </div>
    </button>
  );
}

function DrillDownModal({ student, modules, onClose }: {
  student: CohortStudentProgress;
  modules: Array<{ id: string; title: string; position: number }>;
  onClose: () => void;
}) {
  return (
    <div
      className="ca-fade-up fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: "rgba(15, 19, 64, 0.45)", backdropFilter: "blur(6px)" }}
    >
      <div className="ca-card relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="relative flex items-start justify-between border-b border-ca-ink/[0.08] p-6">
          <div className="flex items-center gap-4">
            <Avatar initials={student.initials} size={56} accent="bg-ca-lime" />
            <div>
              <h3 className="text-[22px] font-black tracking-tight text-ca-ink">{student.full_name}</h3>
              <div className="font-mono text-[11px] font-semibold text-ca-ink-soft">{student.email}</div>
            </div>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-ca-bg-soft">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="relative flex-1 overflow-y-auto p-6">
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="ca-card p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Progreso global</div>
              <div className="mt-1 font-mono text-[28px] font-black text-ca-ink">{student.overall_percentage}%</div>
            </div>
            <div className="ca-card p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Módulos completos</div>
              <div className="mt-1 font-mono text-[28px] font-black" style={{ color: "var(--color-ca-lime-deep)" }}>
                {student.module_progress.filter((m) => m.percentage >= 90).length}
                <span className="text-[14px] opacity-50">/{student.module_progress.length}</span>
              </div>
            </div>
            <div className="ca-card p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Última actividad</div>
              <div className="mt-1 font-mono text-[16px] font-black text-ca-ink">
                {student.last_seen
                  ? new Date(student.last_seen).toLocaleDateString("es-CL", { day: "numeric", month: "short" })
                  : "Sin actividad"}
              </div>
            </div>
          </div>

          <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
            Lecciones por módulo
          </div>
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

        <div className="relative flex items-center justify-between gap-3 border-t border-ca-ink/[0.08] bg-ca-bg-soft px-6 py-4">
          <div className="text-[11px] font-semibold text-ca-ink-soft">
            Datos en vivo · sincronizado con video_progress
          </div>
        </div>
      </div>
    </div>
  );
}

type ProgressTableProps = {
  students: CohortStudentProgress[];
  modules: Array<{ id: string; title: string; position: number }>;
};

export function ProgressTable({ students, modules }: ProgressTableProps) {
  const [drillStudent, setDrillStudent] = useState<CohortStudentProgress | null>(null);
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
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          { id: "all" as const, label: "Todos", count: students.length },
          { id: "complete" as const, label: "Certificables", count: complete },
          { id: "on_track" as const, label: "Al día", count: onTrack },
          { id: "behind" as const, label: "En riesgo", count: behind },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors"
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
            placeholder="Buscar alumno…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 bg-transparent text-[12px] font-medium text-ca-ink outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="ca-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--color-ca-bg-soft)" }}>
                <th className="sticky left-0 z-10 bg-ca-bg-soft px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft" style={{ minWidth: 240 }}>
                  Alumno
                </th>
                {modules.map((m) => (
                  <th key={m.id} className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft" style={{ minWidth: 140 }}>
                    <div className="font-mono">M{String(m.position).padStart(2, "0")}</div>
                    <div className="mt-0.5 text-[10px] normal-case tracking-normal text-ca-ink">
                      {m.title.length > 20 ? m.title.slice(0, 20) + "…" : m.title}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft" style={{ minWidth: 120 }}>
                  Promedio
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.student_id} className="border-t border-ca-ink/[0.08] transition-colors hover:bg-ca-bg-soft">
                  <td className="sticky left-0 z-10 bg-ca-surface px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar initials={s.initials} size={36} />
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-ca-ink">{s.full_name}</div>
                        <div className="font-mono text-[10px] text-ca-ink-soft">{s.email}</div>
                      </div>
                    </div>
                  </td>
                  {s.module_progress.map((mp) => (
                    <td key={mp.module_id} className="px-3 py-3 align-middle">
                      <ProgressCell pct={mp.percentage} onClick={() => setDrillStudent(s)} />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <div
                      className="font-mono text-[18px] font-black"
                      style={{
                        color: s.overall_percentage >= 70
                          ? "var(--color-ca-lime-deep)"
                          : s.overall_percentage >= 30
                            ? "var(--color-ca-ink)"
                            : "#9f1b3e",
                      }}
                    >
                      {s.overall_percentage}%
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="grid place-items-center py-16">
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ca-bg-soft">
                <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                </svg>
              </div>
              <div className="mt-3 text-[14px] font-bold text-ca-ink">Sin alumnos en este filtro</div>
              <div className="text-[12px] text-ca-ink-soft">Ajusta el filtro para ver más resultados.</div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-5 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-ca-ink-soft">
        <span>Click en una celda para ver el detalle</span>
        <span className="opacity-30">·</span>
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

      {drillStudent && (
        <DrillDownModal
          student={drillStudent}
          modules={modules}
          onClose={() => setDrillStudent(null)}
        />
      )}
    </>
  );
}
