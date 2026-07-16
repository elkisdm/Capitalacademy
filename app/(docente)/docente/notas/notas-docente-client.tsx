"use client";

import { useMemo, useState } from "react";
import { EvaluationGrades } from "@/components/admin/quiz/evaluation-grades";
import type { GradableEvaluation } from "@/lib/docente/queries";

export function NotasDocenteClient({ evaluations }: { evaluations: GradableEvaluation[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => evaluations.find((e) => e.id === selectedId) ?? null,
    [evaluations, selectedId],
  );

  if (evaluations.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-ca-ink/[0.10] px-4 py-8 text-center text-[13px] text-ca-ink-soft">
        Tus cohortes aún no tienen evaluaciones configuradas.
      </div>
    );
  }

  if (selected) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="mb-4 text-[12.5px] font-bold text-ca-violet hover:underline"
        >
          ← Volver a la lista
        </button>
        <h2 className="mb-4 text-[16px] font-black tracking-tight text-ca-ink">
          {selected.title} <span className="font-normal text-ca-ink-soft">· {selected.cohortName}</span>
        </h2>
        <EvaluationGrades
          evaluationId={selected.id}
          cohorts={[{ id: selected.cohortId, name: selected.cohortName }]}
          fixedCohortId={selected.cohortId}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {evaluations.map((ev) => (
        <button
          key={`${ev.id}:${ev.cohortId}`}
          type="button"
          onClick={() => setSelectedId(ev.id)}
          className="flex items-center justify-between gap-3 rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-3 text-left transition-colors hover:bg-ca-bg-soft"
        >
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-bold text-ca-ink">{ev.title}</p>
            <p className="text-[12px] text-ca-ink-soft">
              {ev.cohortName} · {ev.kind === "quiz" ? "Quiz" : "Nota manual"}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
