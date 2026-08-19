"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown } from "lucide-react";

/**
 * Orden de los módulos de un programa (migración 0100).
 *
 * El orden vive en el PROVEEDOR y no en cada control por una razón concreta: los
 * chevrones se pintan uno por módulo, repartidos por la página, y la API recibe
 * la lista COMPLETA en cada llamada. Con estado por instancia, dos clics
 * seguidos —o en módulos distintos— se construyen sobre la misma foto vieja y el
 * segundo pisa al primero sin avisar. Con una sola fuente:
 *
 * - el movimiento se aplica optimista y el siguiente clic parte de ahí;
 * - un fallo revierte al orden anterior;
 * - mientras se guarda, TODOS los controles quedan deshabilitados.
 *
 * Es el mismo trato que `LessonReorderList` le da a las lecciones; la diferencia
 * es que allá un solo componente pinta la lista entera y acá está repartida.
 */
type Estado = {
  ids: string[];
  guardando: boolean;
  error: string | null;
  mover: (moduleId: string, delta: -1 | 1) => void;
};

const ModuleOrderContext = createContext<Estado | null>(null);

export function ModuleOrderProvider({
  programId,
  initialIds,
  children,
}: {
  programId: string;
  initialIds: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ids, setIds] = useState(initialIds);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistir = useCallback(
    async (nuevo: string[], anterior: string[]) => {
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
          setIds(anterior); // revertir
          return;
        }
        router.refresh();
      } catch {
        setError("Error de red al mover el módulo");
        setIds(anterior);
      } finally {
        setGuardando(false);
      }
    },
    [programId, router],
  );

  const mover = useCallback(
    (moduleId: string, delta: -1 | 1) => {
      setIds((actual) => {
        const i = actual.indexOf(moduleId);
        const destino = i + delta;
        if (i < 0 || destino < 0 || destino >= actual.length) return actual;

        const nuevo = [...actual];
        [nuevo[i], nuevo[destino]] = [nuevo[destino], nuevo[i]];
        void persistir(nuevo, actual);
        return nuevo;
      });
    },
    [persistir],
  );

  return (
    <ModuleOrderContext.Provider value={{ ids, guardando, error, mover }}>
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

  const { ids, guardando, error, mover } = ctx;
  const i = ids.indexOf(moduleId);
  const puedeSubir = i > 0;
  const puedeBajar = i >= 0 && i < ids.length - 1;

  const boton =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-ca-ink/[0.12] text-ca-ink-soft transition-colors hover:bg-ca-bg-soft hover:text-ca-ink disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <div className="flex items-center gap-1.5">
      {error && <span className="text-[12px] font-medium text-red-600">{error}</span>}
      <button
        type="button"
        onClick={() => mover(moduleId, -1)}
        disabled={!puedeSubir || guardando}
        className={boton}
        aria-label="Subir módulo"
        title="Subir módulo"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => mover(moduleId, 1)}
        disabled={!puedeBajar || guardando}
        className={boton}
        aria-label="Bajar módulo"
        title="Bajar módulo"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}
