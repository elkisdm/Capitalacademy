/**
 * Formateo de montos en pesos chilenos y UF.
 *
 * Helper compartido cliente+servidor. Existe para cerrar el gap que documenta
 * `docs/ui-conventions.md` §2.4: hasta ahora cada pantalla con montos hacía su
 * propio `toLocaleString("es-CL")` y su propio `replace(/\D/g, "")`.
 * Cualquier UI nueva con dinero usa estas funciones — no sumes otro formateo inline.
 */

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const miles = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

const uf = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** `1234567` → `"$1.234.567"`. Redondea: los pesos no llevan decimales. */
export function formatCLP(valor: number): string {
  if (!Number.isFinite(valor)) return clp.format(0);
  return clp.format(Math.round(valor));
}

/** `1234567` → `"1.234.567"`. Para la máscara en vivo de un input de monto. */
export function formatMiles(valor: number): string {
  if (!Number.isFinite(valor)) return "";
  return miles.format(Math.round(valor));
}

/** `2500` → `"2.500 UF"`; admite hasta 2 decimales. */
export function formatUF(valor: number): string {
  if (!Number.isFinite(valor)) return "0 UF";
  return `${uf.format(valor)} UF`;
}

/**
 * Limpia lo que el usuario tipeó en un input de monto y devuelve el número.
 * Descarta cualquier carácter que no sea dígito, así que tolera "$", puntos,
 * espacios y texto pegado desde otra parte.
 */
export function parseMonto(input: string): number {
  const digitos = input.replace(/\D/g, "");
  if (digitos === "") return 0;
  const n = Number(digitos);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Máscara para inputs de monto: recibe lo tipeado y devuelve el par
 * `{ display, value }` — el string con separadores de miles para mostrar y el
 * número limpio para persistir (convención de `docs/ui-conventions.md` §2).
 */
export function maskMonto(input: string): { display: string; value: number } {
  const value = parseMonto(input);
  return { display: value === 0 && input.trim() === "" ? "" : formatMiles(value), value };
}
