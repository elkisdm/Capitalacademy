"use client";

import { useState, useEffect } from "react";
import type { QuizAttempt } from "./types";
import { formatDate } from "./types";
import { LoaderIcon } from "./icons";

export function IntentosTab({ programId }: { programId: string }) {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/admin/quiz-attempts?programId=${programId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setAttempts(data.attempts ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [programId]);

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <LoaderIcon />
        <p className="mt-3 text-[13px] font-semibold text-ca-ink-soft">Cargando intentos...</p>
      </div>
    );
  }

  // Stats
  const totalAttempts = attempts.length;
  const completed = attempts.filter((a) => a.completedAt);
  const passed = completed.filter((a) => a.passed === true);
  const passRate = completed.length > 0 ? Math.round((passed.length / completed.length) * 100) : 0;
  const avgScore =
    completed.length > 0
      ? Math.round(completed.reduce((sum, a) => sum + (a.scorePct ?? 0), 0) / completed.length)
      : 0;

  return (
    <div>
      {/* Stats */}
      <div className="mb-5 grid grid-cols-3 gap-4">
        <div className="ca-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Total intentos</div>
          <div className="mt-1 font-mono text-[28px] font-black text-ca-ink">{totalAttempts}</div>
        </div>
        <div className="ca-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Tasa aprobacion</div>
          <div className="mt-1 font-mono text-[28px] font-black" style={{ color: "var(--color-ca-lime-deep)" }}>
            {passRate}%
          </div>
        </div>
        <div className="ca-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">Nota promedio</div>
          <div className="mt-1 font-mono text-[28px] font-black" style={{ color: "var(--color-ca-violet)" }}>
            {avgScore}%
          </div>
        </div>
      </div>

      {/* Table */}
      {attempts.length === 0 ? (
        <div className="grid place-items-center py-16">
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ca-bg-soft">
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            </div>
            <div className="mt-3 text-[14px] font-bold text-ca-ink">Sin intentos</div>
            <div className="text-[12px] text-ca-ink-soft">
              Aun no hay alumnos que hayan tomado el quiz.
            </div>
          </div>
        </div>
      ) : (
        <div className="ca-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--color-ca-bg-soft)" }}>
                  <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Alumno
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Nota
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Fecha
                  </th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => {
                  const status =
                    a.completedAt == null
                      ? { label: "En progreso", bg: "rgba(20,22,58,0.06)", color: "var(--color-ca-ink-soft)" }
                      : a.passed
                        ? { label: "Aprobado", bg: "rgba(168,211,16,0.22)", color: "#3f5a05" }
                        : { label: "Reprobado", bg: "rgba(245,158,11,0.18)", color: "#92400e" };

                  return (
                    <tr key={a.id} className="border-t border-ca-ink/[0.08] transition-colors hover:bg-ca-bg-soft">
                      <td className="px-5 py-3">
                        <span className="text-[13px] font-bold text-ca-ink">{a.studentName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[15px] font-black text-ca-ink">
                          {a.scorePct != null ? `${a.scorePct}%` : "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: status.bg, color: status.color }}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] font-medium text-ca-ink-soft">
                          {formatDate(a.completedAt ?? a.startedAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
