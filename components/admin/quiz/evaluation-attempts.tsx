"use client";

import { useCallback, useEffect, useState } from "react";
import type { EvaluationAttempt } from "./types";
import { formatDate } from "./types";
import { CheckCircleIcon, ChevronIcon, LoaderIcon } from "./icons";

/**
 * Pestaña "Respuestas": intentos de ESTA evaluación con stats + drill-down.
 * Al abrir un intento se ve cada pregunta con la respuesta del alumno frente a
 * la correcta (✓/✗). Datos de GET /api/admin/evaluations/[id]/attempts.
 */
export function EvaluationAttempts({ evaluationId }: { evaluationId: string }) {
  const [attempts, setAttempts] = useState<EvaluationAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/evaluations/${evaluationId}/attempts`);
      if (res.ok) {
        const data = await res.json();
        setAttempts(data.attempts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [evaluationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="grid place-items-center py-12">
        <LoaderIcon />
      </div>
    );
  }

  if (attempts.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-ca-ink/[0.10] px-4 py-10 text-center">
        <p className="text-[14px] font-bold text-ca-ink">Sin respuestas todavía</p>
        <p className="mt-1 text-[13px] text-ca-ink-soft">
          Cuando un alumno rinda esta evaluación, sus respuestas aparecerán aquí.
        </p>
      </div>
    );
  }

  const completed = attempts.filter((a) => a.completedAt);
  const passed = completed.filter((a) => a.passed === true);
  const passRate = completed.length > 0 ? Math.round((passed.length / completed.length) * 100) : 0;
  const avgScore =
    completed.length > 0
      ? Math.round(completed.reduce((s, a) => s + (a.scorePct ?? 0), 0) / completed.length)
      : 0;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Intentos" value={String(attempts.length)} />
        <Stat label="Aprobación" value={`${passRate}%`} color="var(--color-ca-lime-deep)" />
        <Stat label="Nota prom." value={`${avgScore}%`} color="var(--color-ca-violet)" />
      </div>

      {/* Lista de intentos */}
      <div className="overflow-hidden rounded-xl border border-ca-ink/[0.08]">
        {attempts.map((a) => {
          const open = openId === a.id;
          const status =
            a.completedAt == null
              ? { label: "En progreso", bg: "rgba(20,22,58,0.06)", color: "var(--color-ca-ink-soft)" }
              : a.passed
                ? { label: "Aprobado", bg: "rgba(168,211,16,0.22)", color: "#3f5a05" }
                : { label: "Reprobado", bg: "rgba(245,158,11,0.18)", color: "#92400e" };
          return (
            <div key={a.id} className="border-b border-ca-ink/[0.06] last:border-b-0">
              <button
                onClick={() => setOpenId(open ? null : a.id)}
                disabled={a.breakdown.length === 0}
                className="flex w-full items-center gap-3 bg-white px-4 py-3 text-left transition-colors hover:bg-ca-bg-soft/50 disabled:cursor-default"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold text-ca-ink">{a.studentName}</div>
                  <div className="text-[11.5px] text-ca-ink-soft">
                    {formatDate(a.completedAt ?? a.startedAt)}
                    {a.completedAt && a.totalPresented > 0 && (
                      <> · {a.correctCount}/{a.totalPresented} correctas</>
                    )}
                  </div>
                </div>
                <span className="font-mono text-[15px] font-black text-ca-ink">
                  {a.scorePct != null ? `${a.scorePct}%` : "—"}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: status.bg, color: status.color }}
                >
                  {status.label}
                </span>
                {a.breakdown.length > 0 && <ChevronIcon open={open} />}
              </button>

              {open && a.breakdown.length > 0 && (
                <div className="space-y-2 bg-ca-bg-soft/40 px-4 py-3">
                  {a.breakdown.map((b, i) => (
                    <div
                      key={b.questionId}
                      className="rounded-lg border border-ca-ink/[0.06] bg-white px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                          style={{
                            background: b.isCorrect ? "rgba(168,211,16,0.22)" : "rgba(245,158,11,0.18)",
                            color: b.isCorrect ? "#3f5a05" : "#92400e",
                          }}
                        >
                          {b.isCorrect ? <CheckCircleIcon /> : "✕"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-semibold text-ca-ink">
                            <span className="font-mono text-ca-ink-soft">{i + 1}.</span> {b.questionText}
                          </p>
                          <div className="mt-1.5 grid gap-1 text-[12px]">
                            <div>
                              <span className="font-bold text-ca-ink-soft">Respondió: </span>
                              <span style={{ color: b.isCorrect ? "#3f5a05" : "#92400e", fontWeight: 600 }}>
                                {b.givenDisplay}
                              </span>
                            </div>
                            {!b.isCorrect && (
                              <div>
                                <span className="font-bold text-ca-ink-soft">Correcta: </span>
                                <span className="font-semibold" style={{ color: "#3f5a05" }}>
                                  {b.correctDisplay}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-ca-ink/[0.08] bg-white p-3 text-center">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">{label}</div>
      <div className="mt-0.5 font-mono text-[22px] font-black" style={{ color: color ?? "var(--color-ca-ink)" }}>
        {value}
      </div>
    </div>
  );
}
