"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown } from "lucide-react";

/**
 * Sube o baja un módulo dentro de su programa (migración 0100).
 *
 * Existía el reorden de LECCIONES pero no el del módulo que las contiene, así
 * que el orden de la ruta de aprendizaje solo se podía cambiar por SQL. Operaciones
 * pidió subir "Bienvenida CI" al primer lugar del Ciclo y quedó bloqueada.
 *
 * Manda la lista COMPLETA de ids en el orden nuevo, no "mové este uno": es lo que
 * espera el RPC, que reasigna 1..N de una sola vez para no chocar con
 * unique(program_id, position).
 */
export function ModuleReorderControls({
  programId,
  moduleId,
  orderedModuleIds,
}: {
  programId: string;
  moduleId: string;
  /** Todos los módulos del programa, en el orden en que se ven ahora. */
  orderedModuleIds: string[];
}) {
  const router = useRouter();
  const [moviendo, setMoviendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const indice = orderedModuleIds.indexOf(moduleId);
  const puedeSubir = indice > 0;
  const puedeBajar = indice >= 0 && indice < orderedModuleIds.length - 1;

  const mover = async (delta: number) => {
    const destino = indice + delta;
    if (indice < 0 || destino < 0 || destino >= orderedModuleIds.length) return;

    const nuevo = [...orderedModuleIds];
    [nuevo[indice], nuevo[destino]] = [nuevo[destino], nuevo[indice]];

    setMoviendo(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/modules/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, orderedIds: nuevo }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "No se pudo mover el módulo");
        return;
      }
      router.refresh();
    } catch {
      setError("Error de red al mover el módulo");
    } finally {
      setMoviendo(false);
    }
  };

  const boton =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-ca-ink/[0.12] text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className="flex items-center gap-1.5">
      {error && <span className="text-[12px] font-medium text-red-600">{error}</span>}
      <button
        type="button"
        onClick={() => mover(-1)}
        disabled={!puedeSubir || moviendo}
        className={boton}
        aria-label="Subir módulo"
        title="Subir módulo"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => mover(1)}
        disabled={!puedeBajar || moviendo}
        className={boton}
        aria-label="Bajar módulo"
        title="Bajar módulo"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}
