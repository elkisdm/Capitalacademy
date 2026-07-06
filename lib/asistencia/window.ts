/**
 * Ventana temporal válida para registrar asistencia a una clase en vivo.
 *
 * El alumno puede marcar asistencia desde 20 min ANTES del inicio y hasta 30 min
 * DESPUÉS del término de la sesión. Fuera de ese rango el check-in se rechaza.
 *
 * Decisión tomada: la ventana aplica IGUAL a clases presenciales y online. No
 * distinguimos modalidad — el QR es el mismo mecanismo en ambos casos.
 */

export const GRACE_BEFORE_MIN = 20;
export const GRACE_AFTER_MIN = 30;

const MINUTE_MS = 60_000;

type SessionWindow = {
  starts_at: string;
  ends_at: string;
};

/**
 * `true` si `now` cae dentro de [starts_at - 20min, ends_at + 30min].
 */
export function isWithinWindow(session: SessionWindow, now: Date = new Date()): boolean {
  const opensAt = new Date(session.starts_at).getTime() - GRACE_BEFORE_MIN * MINUTE_MS;
  const closesAt = new Date(session.ends_at).getTime() + GRACE_AFTER_MIN * MINUTE_MS;
  const t = now.getTime();
  return t >= opensAt && t <= closesAt;
}

/** Etiqueta lista para mensajes de error cuando el check-in cae fuera de horario. */
export const OUTSIDE_WINDOW_LABEL =
  `El registro está disponible desde ${GRACE_BEFORE_MIN} minutos antes del inicio de la clase ` +
  `y hasta ${GRACE_AFTER_MIN} minutos después de que termina.`;
