/**
 * Código legible de una reunión (migración 0089).
 *
 * Formato Meet: tres bloques de letras minúsculas, `abc-defg-hij`. Sin dígitos,
 * para que no haya forma de confundir 0 con O ni 1 con l — que es justo lo que
 * hace impronunciable a un UUID.
 *
 * El UUID de la sesión sigue existiendo y sigue siendo la clave real; lo que
 * cambia es que deja de aparecer en la URL.
 */

const CODE_RE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMeetingCode(value: string): boolean {
  return CODE_RE.test(value.trim().toLowerCase());
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export type SessionRef =
  | { kind: "code"; value: string }
  | { kind: "id"; value: string }
  | { kind: "invalid" };

/**
 * Interpreta lo que venga en la URL de una clase.
 *
 * Se aceptan LAS DOS formas a propósito: los correos de recordatorio y los
 * favoritos que ya circulan llevan el UUID, y romperlos por estrenar un formato
 * nuevo sería cambiarle el problema de lugar al alumno. El código es el camino
 * por defecto; el UUID, compatibilidad hacia atrás.
 */
export function parseSessionRef(raw: string | null | undefined): SessionRef {
  const value = raw?.trim() ?? "";
  if (!value) return { kind: "invalid" };
  if (isMeetingCode(value)) return { kind: "code", value: value.toLowerCase() };
  if (isUuid(value)) return { kind: "id", value };
  return { kind: "invalid" };
}

/** Ruta de la sala inmersiva de una clase. */
export function meetingPath(code: string): string {
  return `/sala/${code}`;
}
