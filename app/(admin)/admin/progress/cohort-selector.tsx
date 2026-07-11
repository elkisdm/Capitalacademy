"use client";

import { useRouter, usePathname } from "next/navigation";
import { Select } from "@/components/ui/field";

type CohortOption = {
  id: string;
  name: string;
  code: string;
  programName: string;
};

export function CohortSelector({
  cohorts,
  selectedId,
}: {
  cohorts: CohortOption[];
  selectedId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const cohortId = e.target.value;
    router.push(`${pathname}?cohort=${cohortId}`);
  }

  return (
    <div className="mb-6">
      <label
        htmlFor="cohort-select"
        className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft"
      >
        Cohorte
      </label>
      <Select
        id="cohort-select"
        value={selectedId}
        onChange={handleChange}
        className="max-w-sm"
      >
        {cohorts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} — {c.programName} ({c.code})
          </option>
        ))}
      </Select>
    </div>
  );
}
