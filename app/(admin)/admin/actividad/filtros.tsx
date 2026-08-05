"use client";

import { useRouter, usePathname } from "next/navigation";
import { Select } from "@/components/ui/field";
import { ACTIVITY_RANGE_OPTIONS } from "@/lib/classroom/actividad";

type CohortOption = {
  id: string;
  name: string;
  code: string;
  programName: string;
};

// Se importa de lib/ y NO se define acá: este módulo es "use client", y un
// componente de servidor que importe un valor desde acá recibe una referencia
// proxy en vez del array. Ver el comentario en lib/classroom/actividad.ts.
const RANGE_OPTIONS = ACTIVITY_RANGE_OPTIONS;

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
