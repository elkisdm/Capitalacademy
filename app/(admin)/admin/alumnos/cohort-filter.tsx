"use client";

import { useRouter, usePathname } from "next/navigation";
import { Select } from "@/components/ui/field";

type CohortOption = {
  id: string;
  name: string;
  code: string;
};

export function CohortFilter({
  cohorts,
  selectedId,
}: {
  cohorts: CohortOption[];
  selectedId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const cohortId = e.target.value;
    router.push(cohortId ? `${pathname}?cohort=${cohortId}` : pathname);
  }

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="cohort-filter-select"
        className="shrink-0 text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft"
      >
        Cohorte
      </label>
      <Select
        id="cohort-filter-select"
        value={selectedId ?? ""}
        onChange={handleChange}
        className="max-w-xs"
      >
        <option value="">Todas las cohortes</option>
        {cohorts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.code})
          </option>
        ))}
      </Select>
    </div>
  );
}
