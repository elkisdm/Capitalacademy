/**
 * Interpretación de lo que llega por la URL: ¿slug legible o UUID?
 *
 * Desde las migraciones 0089 y 0090 las rutas del aula usan identificadores
 * legibles (`/docente/paola-vicuna`, `/quiz/quiz-de-clase-marca-personal`) en
 * vez del UUID crudo, que era ilegible, indictable e irreconocible.
 *
 * Se siguen aceptando LAS DOS formas, y no es transitorio: hay enlaces con UUID
 * viviendo en correos ya enviados, en notificaciones y en los favoritos de la
 * gente. Romperlos por estrenar un formato nuevo sería mudarle el problema al
 * alumno.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un slug razonable: minúsculas, números y guiones. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type Ref =
  | { column: "id"; value: string }
  | { column: "slug"; value: string }
  | null;

/**
 * Devuelve con QUÉ columna hay que buscar, o `null` si lo que llegó no es
 * ninguna de las dos.
 *
 * Que devuelva `null` importa: pasar basura a una consulta contra una columna
 * `uuid` es un error de Postgres (un 500), no el 404 limpio que corresponde.
 */
export function resolveRef(raw: string | null | undefined): Ref {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  if (UUID_RE.test(value)) return { column: "id", value };

  const lower = value.toLowerCase();
  // Tope de largo: un slug enorme es basura o un intento de abuso, no una URL
  // que alguien vaya a escribir.
  if (lower.length <= 120 && SLUG_RE.test(lower)) return { column: "slug", value: lower };

  return null;
}
