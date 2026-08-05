/**
 * Tipos del tour guiado del alumno (ADR-0030).
 *
 * El guion vive como DATOS (`./steps`) y la geometría como funciones puras
 * (`./position`) a propósito: así se pueden testear en el entorno `node` de
 * vitest, que es donde este proyecto mide cobertura. El componente
 * (`components/classroom/tour/guided-tour.tsx`) solo orquesta DOM y estado.
 */

/** Lado del elemento destacado donde se intenta poner la tarjeta. */
export type Side = "top" | "bottom" | "left" | "right";

/** Resultado de la ubicación: un lado, o centrada cuando no hay elemento. */
export type Placement = Side | "center";

/** Rectángulo en coordenadas de viewport (como `getBoundingClientRect`). */
export type Rect = { top: number; left: number; width: number; height: number };

export type Size = { width: number; height: number };

export type TourStep = {
  /** Identificador estable del paso. Único dentro del guion. */
  id: string;
  /**
   * Valor del atributo `data-tour` del elemento a destacar, o `null` para una
   * tarjeta centrada sin foco (bienvenida y cierre).
   */
  target: string | null;
  title: string;
  body: string;
  /** Lado preferido para la tarjeta. Si no cabe, se busca otro. */
  prefer?: Side;
  /** Enlace opcional al pie de la tarjeta. */
  link?: { href: string; label: string };
};

/**
 * Cómo arranca el tour en una carga de página. Lo decide el servidor:
 * - `off`: no se abre solo (ya lo vio, o es staff/docente).
 * - `auto`: primera vez del alumno.
 * - `forced`: lo pidió explícitamente (re-lanzado desde el Centro de ayuda).
 */
export type TourStart = "off" | "auto" | "forced";

/** Cómo cerró el alumno el tour. Se persiste en `profiles.tour_outcome`. */
export type TourOutcome = "completed" | "skipped";
