import type { TourStart } from "./types";

/**
 * Decide cómo arranca el tour en una carga del dashboard.
 *
 * FALLA CERRADO ante un error de lectura. Si la consulta de
 * `profiles.tour_completed_at` falla —la migración 0088 todavía no está
 * aplicada, o `profiles` devolvió un statement timeout como el incidente 57014
 * del 21-jul (ver 0079)— el tour NO se dispara.
 *
 * Al revés el fallo es mucho peor de lo que parece: con la lectura rota, `seen`
 * queda indefinido y el tour arrancaría en `auto` para TODA la matrícula, en
 * cada carga; y como el `POST /api/classroom/tour` tampoco podría persistir el
 * cierre, volvería a aparecer indefinidamente. Un desfase de despliegue de un
 * fin de semana se convierte en un incidente de soporte para todos los alumnos.
 */
export function resolveTourStart(input: {
  /** Llegó `?tour=1`: el alumno lo pidió desde el Centro de ayuda. */
  forced: boolean;
  /** Staff o docente: el tour es contenido de alumno. */
  isStaff: boolean;
  /** Valor de `profiles.tour_completed_at`, o `null` si nunca lo cerró. */
  completedAt: string | null | undefined;
  /** La lectura de `profiles` falló (columna ausente, timeout, RLS). */
  readFailed: boolean;
}): TourStart {
  if (input.forced) return "forced";
  if (input.isStaff) return "off";
  if (input.readFailed) return "off";
  return input.completedAt ? "off" : "auto";
}
