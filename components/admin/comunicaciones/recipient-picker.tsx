"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { seleccionEfectiva } from "@/lib/campaigns/seleccion";

export type AudiencePerson = {
  studentId: string;
  email: string;
  fullName: string;
};

type Props = {
  people: AudiencePerson[];
  loading: boolean;
  /**
   * `null` = sin selección manual: se le escribe a toda la audiencia del filtro.
   * Es distinto de "todos marcados": si entra alguien nuevo al filtro, `null`
   * lo incluye y una lista explícita no.
   */
  selected: string[] | null;
  onChange: (next: string[] | null) => void;
  disabled?: boolean;
};

/**
 * Lista de destinatarios con casillas, para elegir a mano a quién se le escribe
 * dentro de la audiencia que ya definieron los filtros (0092).
 *
 * El buscador filtra lo que se VE, nunca lo que está seleccionado: buscar y
 * pulsar "Ninguno" desmarca solo lo visible. Lo contrario —que un filtro de
 * texto silenciosamente descarte gente marcada— es justo el error que hace que
 * un comunicado llegue a menos personas de las que uno cree.
 */
export function RecipientPicker({ people, loading, selected, onChange, disabled }: Props) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) => p.fullName.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [people, query]);

  // `null` se expande a "todos" solo para pintar las casillas. El valor que se
  // guarda sigue siendo null hasta que alguien destilda a alguien.
  const selectedSet = useMemo(
    () => (selected === null ? new Set(people.map((p) => p.studentId)) : new Set(selected)),
    [selected, people],
  );

  const selectedCount = people.filter((p) => selectedSet.has(p.studentId)).length;
  const allSelected = people.length > 0 && selectedCount === people.length;

  /**
   * Traduce un conjunto de ids marcados al valor que se guarda.
   *
   * El filtrado contra `people` va SIEMPRE primero, y recién después se compara
   * el tamaño: `selectedSet` puede arrastrar ids de una selección guardada cuyos
   * dueños ya salieron de la cohorte, y comparar el conjunto crudo contra
   * `people.length` daba "ya están todos" sin que lo estuvieran — marcaba `null`
   * y le escribía a gente que nadie había elegido. `seleccionEfectiva` es la
   * misma función que decide qué se guarda, para que no haya dos reglas.
   */
  function commit(next: Set<string>) {
    const ids = people.map((p) => p.studentId);
    const enAudiencia = seleccionEfectiva(ids, [...next]);
    // Volver a marcar a todos equivale a no tener selección manual.
    onChange(enAudiencia.length === ids.length ? null : enAudiencia);
  }

  function toggle(studentId: string, checked: boolean) {
    const next = new Set(selectedSet);
    if (checked) next.add(studentId);
    else next.delete(studentId);
    commit(next);
  }

  function selectAllVisible() {
    const next = new Set(selectedSet);
    for (const p of visible) next.add(p.studentId);
    commit(next);
  }

  function clearVisible() {
    const next = new Set(selectedSet);
    for (const p of visible) next.delete(p.studentId);
    commit(next);
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <p className="rounded-xl bg-ca-bg-soft px-4 py-3 text-[13px] text-ca-ink-soft">
        No hay nadie en esta audiencia. Revisa la cohorte y el estado de matrícula.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ca-ink-soft"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar destinatario"
            className="pl-8"
            disabled={disabled}
          />
        </div>
        <button
          type="button"
          onClick={selectAllVisible}
          disabled={disabled}
          className="rounded-full bg-ca-ink/5 px-3 py-1.5 text-[12px] font-bold text-ca-ink-soft transition-colors hover:bg-ca-ink/10 disabled:opacity-50"
        >
          {query ? "Marcar los visibles" : "Todos"}
        </button>
        <button
          type="button"
          onClick={clearVisible}
          disabled={disabled}
          className="rounded-full bg-ca-ink/5 px-3 py-1.5 text-[12px] font-bold text-ca-ink-soft transition-colors hover:bg-ca-ink/10 disabled:opacity-50"
        >
          {query ? "Desmarcar los visibles" : "Ninguno"}
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-xl border border-ca-ink/[0.08] bg-ca-surface">
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-ca-ink-soft">
            Nadie calza con “{query}”
          </p>
        ) : (
          <ul className="divide-y divide-ca-ink/[0.06]">
            {visible.map((p) => (
              <li key={p.studentId} className="px-3 py-2">
                <Checkbox
                  checked={selectedSet.has(p.studentId)}
                  onChange={(checked) => toggle(p.studentId, checked)}
                  disabled={disabled}
                  className="w-full"
                  label={
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-semibold text-ca-ink">
                        {p.fullName || p.email}
                      </span>
                      {p.fullName && (
                        <span className="truncate text-[12px] text-ca-ink-soft">{p.email}</span>
                      )}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-[12px] text-ca-ink-soft">
        <Users size={13} />
        {allSelected ? (
          <>Se le escribirá a las {people.length} personas de esta audiencia</>
        ) : (
          <>
            <strong className="font-black text-ca-ink">{selectedCount}</strong> de {people.length}{" "}
            seleccionadas
          </>
        )}
      </p>
    </div>
  );
}
