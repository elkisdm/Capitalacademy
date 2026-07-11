"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";

type ProgramOption = { id: string; name: string };

/**
 * Selector de programa para las páginas admin que se scopan por programa (el
 * tenant). Al cambiar navega a `?program=<id>` para que el servidor re-filtre
 * solo los datos de ese programa. `basePath` permite reusarlo entre páginas.
 */
export function ProgramFilter({
  programs,
  selectedProgramId,
  basePath,
}: {
  programs: ProgramOption[];
  selectedProgramId: string;
  basePath: string;
}) {
  const router = useRouter();

  return (
    <div>
      <label
        htmlFor="program-filter"
        className="mb-1 block font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft"
      >
        Programa
      </label>
      <Select
        id="program-filter"
        value={selectedProgramId}
        onChange={(e) => router.push(`${basePath}?program=${e.target.value}`)}
        className="w-full max-w-md rounded-md border border-ca-ink/[0.12] bg-white px-3 py-2 text-sm font-semibold text-ca-ink focus:border-ca-violet focus:outline-none focus:ring-1 focus:ring-ca-violet/30"
      >
        {programs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
