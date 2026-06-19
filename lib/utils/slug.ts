/**
 * Slug para URLs legibles del classroom (cohorts/módulos/lecciones).
 * Deriva un slug base del título y lo hace único contra una lista de existentes.
 * Las tablas tienen un unique index parcial sobre `slug` (0013), así que el slug
 * debe ser único por tabla; la unicidad final la garantiza el caller pasando los
 * slugs ya tomados.
 */

export function slugify(input: string): string {
  return input
    .replace(/ñ/gi, "n")
    .normalize("NFD")
    // elimina diacríticos combinantes (á → a)
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Devuelve un slug único: el base, o base-2, base-3… si ya está tomado.
 * `taken` es el conjunto de slugs existentes (mismo scope/tabla).
 */
export function uniqueSlug(input: string, taken: Iterable<string>): string {
  const base = slugify(input) || "item";
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
