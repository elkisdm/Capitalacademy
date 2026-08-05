"use client";

import { usePathname } from "next/navigation";
import { useActividadTracker } from "@/lib/classroom/use-actividad-tracker";

/**
 * Sub-rutas de /classroom que NO son slugs de cohorte. Mismo criterio que
 * RESERVED_SUBPATHS en app/(classroom)/layout.tsx, más "go" (los enlaces
 * profundos /classroom/go/... que redirigen a la cohorte real).
 */
const RESERVED_SUBPATHS = new Set(["profile", "guia", "quiz", "go"]);

/**
 * Monta el latido de actividad (ADR-0029). No pinta nada.
 *
 * La cohorte se deriva de `usePathname()` y NO de una prop del layout a
 * propósito: los layouts del App Router no se re-renderizan en navegación
 * client-side, así que una prop quedaría pegada a la cohorte del primer render
 * y le acreditaría a esa el tiempo que el alumno pasa en otra (el mismo bug que
 * ya se arregló en el sidebar el 13-jul).
 */
export function ActividadTracker() {
  const pathname = usePathname() ?? "";
  const parts = pathname.split("/").filter(Boolean);
  const cohortSlug =
    parts[0] === "classroom" && parts[1] && !RESERVED_SUBPATHS.has(parts[1])
      ? parts[1]
      : undefined;

  useActividadTracker({ cohortSlug });

  return null;
}
