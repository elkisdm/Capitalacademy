"use client";

import { createContext, useCallback, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown } from "lucide-react";

/**
 * Orden de los módulos de un programa (migración 0100).
 *
 * Dos decisiones que parecen raras y no lo son:
 *
 * 1. **El orden se lee de las props del servidor, no de un estado local.** La
 *    lista de módulos la pinta el componente de servidor, así que un estado
 *    "optimista" acá sería invisible: la pantalla seguiría mostrando el orden
 *    viejo mientras el índice interno ya cambió, y el siguiente clic movería un
 *    módulo distinto al que el usuario está apuntando. Se actúa sobre lo que se
 *    ve, siempre.
 * 2. **Los controles quedan bloqueados hasta que la pantalla se pone al día**,
 *    no hasta que responde el POST. `router.refresh()` es un viaje al servidor
 *    aparte; soltar los botones al terminar el fetch deja una ventana en la que
 *    el DOM muestra el orden anterior. Por eso el refresh va dentro de una
 *    transición y su `isPending` también deshabilita.
 *
 * El bloqueo es compartido por todos los controles porque la API recibe la lista
 * COMPLETA en cada llamada: dos movimientos en vuelo se pisan entero, no se
 * combinan.
 */
type Estado = {
  ids: string[];
  ocupado: boolean;
  mover: (moduleId: string, delta: -1 | 1) => void;
};

const ModuleOrderContext = createContext<Estado | null>(null);

export function ModuleOrderProvider({
  programId,
  orderedIds,
  children,
}: {
  programId: string;
  /** Módulos en el orden en que se están mostrando ahora mismo. */
  orderedIds: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, startTransition] = useTransition();

  const mover = useCallback(
    async (moduleId: string, delta: -1 | 1) => {
      const i = orderedIds.indexOf(moduleId);
      const destino = i + delta;
      if (i < 0 || destino < 0 || destino >= orderedIds.length) return;

      const nuevo = [...orderedIds];
      [nuevo[i], nuevo[destino]] = [nuevo[destino], nuevo[i]];

      setGuardando(true);
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
        startTransition(() => router.refresh());
      } catch {
        setError("Error de red al mover el módulo");
      } finally {
        setGuardando(false);
      }
    },
    [programId, orderedIds, router],
  );

  return (
    <ModuleOrderContext.Provider
      value={{ ids: orderedIds, ocupado: guardando || refrescando, mover }}
    >
      {/* El error se pinta UNA vez: vive en el proveedor, así que dentro de cada
          control se repetiría tantas veces como módulos haya. */}
      {error && (
        <p role="alert" className="mb-4 text-[13px] font-medium text-red-600">
          {error}
        </p>
      )}
      {children}
    </ModuleOrderContext.Provider>
  );
}

/**
 * Sube o baja un módulo. Sin proveedor alrededor no se pinta: es preferible a
 * mostrar unos chevrones que no mueven nada.
 */
export function ModuleReorderControls({ moduleId }: { moduleId: string }) {
  const ctx = useContext(ModuleOrderContext);
  if (!ctx) return null;

  const { ids, ocupado, mover } = ctx;
  const i = ids.indexOf(moduleId);
  const puedeSubir = i > 0;
  const puedeBajar = i >= 0 && i < ids.length - 1;

  const boton =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-ca-ink/[0.12] text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => mover(moduleId, -1)}
        disabled={!puedeSubir || ocupado}
        className={boton}
        aria-label="Subir módulo"
        title="Subir módulo"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => mover(moduleId, 1)}
        disabled={!puedeBajar || ocupado}
        className={boton}
        aria-label="Bajar módulo"
        title="Bajar módulo"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}
