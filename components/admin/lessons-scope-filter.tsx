"use client";

import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

/**
 * Selectores de alcance del editor de lecciones: programa (define los módulos y
 * lecciones grabadas) + cohorte (define qué clases del calendario se muestran).
 * Las lecciones grabadas son del programa; las clases en vivo, de la cohorte.
 */
export function LessonsScopeFilter({
  programs,
  cohorts,
  selectedProgramId,
  selectedCohortId,
}: {
  programs: Option[];
  cohorts: Option[];
  selectedProgramId: string;
  selectedCohortId: string | null;
}) {
  const router = useRouter();

  const go = (programId: string, cohortId: string | null) => {
    const params = new URLSearchParams({ program: programId });
    if (cohortId) params.set("cohort", cohortId);
    router.push(`/admin/lessons?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-4">
      <div>
        <label
          htmlFor="lessons-program"
          className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft"
        >
          Programa
        </label>
        <select
          id="lessons-program"
          value={selectedProgramId}
          // Al cambiar de programa la cohorte se resetea (otra cohorte distinta).
          onChange={(e) => go(e.target.value, null)}
          className="w-full max-w-xs rounded-md border border-ca-ink/[0.12] bg-white px-3 py-2 text-sm font-semibold text-ca-ink focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30"
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {cohorts.length > 0 && (
        <div>
          <label
            htmlFor="lessons-cohort"
            className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft"
          >
            Cohorte (clases en vivo)
          </label>
          <select
            id="lessons-cohort"
            value={selectedCohortId ?? ""}
            onChange={(e) => go(selectedProgramId, e.target.value || null)}
            className="w-full max-w-xs rounded-md border border-ca-ink/[0.12] bg-white px-3 py-2 text-sm font-semibold text-ca-ink focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30"
          >
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
