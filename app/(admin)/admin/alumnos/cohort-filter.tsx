"use client";

import { useRouter, usePathname } from "next/navigation";

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
    <div className="mb-6">
      <label
        htmlFor="cohort-filter-select"
        className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft"
      >
        Cohorte
      </label>
      <select
        id="cohort-filter-select"
        value={selectedId ?? ""}
        onChange={handleChange}
        className="w-full max-w-sm rounded-xl border border-ca-ink/[0.14] bg-white px-4 py-2.5 text-[14px] font-medium text-ca-ink outline-none transition-colors focus:border-ca-violet"
      >
        <option value="">Todas las cohortes</option>
        {cohorts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.code})
          </option>
        ))}
      </select>
    </div>
  );
}
