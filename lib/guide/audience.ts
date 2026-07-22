import type { Audience } from "./types";

/**
 * Pestañas visibles para un espectador. NO son roles excluyentes: staff que
 * además dicta ve las tres; un docente que es alumno de otro programa ve dos.
 * El PRIMER elemento es la pestaña por defecto.
 *
 * - Alumno (o cualquiera): ["student"]
 * - Docente puro:          ["teacher", "student"]
 * - Staff (ops/admin):     ["student", "team", "teacher"]
 *
 * Staff ve la pestaña de profesor SIN consultar nada: ops/admin entra a
 * /docente por `app/(docente)/layout.tsx:35` y necesita poder responderle a un
 * profe lo mismo que el profe lee.
 */
export function visibleAudiences(v: { isStaff: boolean; isTeacher: boolean }): Audience[] {
  if (v.isStaff) return ["student", "team", "teacher"];
  if (v.isTeacher) return ["teacher", "student"];
  return ["student"];
}
