"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";

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
        <Select
          id="lessons-program"
          value={selectedProgramId}
          // Al cambiar de programa la cohorte se resetea (otra cohorte distinta).
          onChange={(e) => go(e.target.value, null)}
          className="w-full max-w-xs font-semibold"
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {cohorts.length > 0 && (
        <div>
          <label
            htmlFor="lessons-cohort"
            className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft"
          >
            Cohorte (clases en vivo)
          </label>
          <Select
            id="lessons-cohort"
            value={selectedCohortId ?? ""}
            onChange={(e) => go(selectedProgramId, e.target.value || null)}
            className="w-full max-w-xs font-semibold"
          >
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
