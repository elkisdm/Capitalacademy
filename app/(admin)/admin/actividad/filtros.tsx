"use client";

import { useRouter, usePathname } from "next/navigation";
import { Select } from "@/components/ui/field";

type CohortOption = {
  id: string;
  name: string;
  code: string;
  programName: string;
};

export const RANGE_OPTIONS = [7, 30, 90] as const;

export function ActividadFiltros({
  cohorts,
  selectedId,
  rangeDays,
}: {
  cohorts: CohortOption[];
  selectedId: string;
  rangeDays: number;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function push(cohortId: string, dias: number) {
    router.push(`${pathname}?cohort=${cohortId}&dias=${dias}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2">
        <label
          htmlFor="actividad-cohort"
          className="shrink-0 text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft"
        >
          Cohorte
        </label>
        <Select
          id="actividad-cohort"
          value={selectedId}
          onChange={(e) => push(e.target.value, rangeDays)}
          className="max-w-xs"
        >
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.programName} ({c.code})
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <label
          htmlFor="actividad-rango"
          className="shrink-0 text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft"
        >
          Rango
        </label>
        <Select
          id="actividad-rango"
          value={String(rangeDays)}
          onChange={(e) => push(selectedId, Number(e.target.value))}
        >
          {RANGE_OPTIONS.map((d) => (
            <option key={d} value={d}>
              Últimos {d} días
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
