/** Deja solo los dígitos del teléfono (sin +, espacios ni guiones). */
export function cleanPhone(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Formatea un teléfono chileno a `+56 9 XXXX XXXX` de forma TOLERANTE: si el
 * número no calza el patrón móvil chileno, devuelve algo razonable sin romper
 * la entrada. No valida — solo prettifica para mostrar/guardar consistente.
 *
 *   "987759467"      → "+56 9 8775 9467"
 *   "+56 9 8775 9467" → "+56 9 8775 9467"
 *   "56987759467"    → "+56 9 8775 9467"
 *   "87759467"       → "+56 9 8775 9467"  (8 dígitos → se asume móvil)
 */
export function formatPhone(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  let digits = cleanPhone(raw);
  if (digits.startsWith("56")) digits = digits.slice(2);

  // Móvil chileno: 9 + 8 dígitos.
  if (digits.length === 9 && digits.startsWith("9")) {
    return `+56 9 ${digits.slice(1, 5)} ${digits.slice(5)}`;
  }
  // 8 dígitos sueltos → se asume móvil y se antepone el 9.
  if (digits.length === 8) {
    return `+56 9 ${digits.slice(0, 4)} ${digits.slice(4)}`;
  }

  // No reconocido: no romper la entrada del usuario.
  if (raw.startsWith("+")) return raw;
  return digits ? `+${digits}` : raw;
}
