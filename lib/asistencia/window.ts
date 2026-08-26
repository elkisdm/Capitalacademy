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

export type WindowState = "before" | "open" | "closed";

/**
 * Estado de la ventana de asistencia respecto a `now`: 'before' (aún no abre),
 * 'open' (dentro de [starts_at - 20min, ends_at + 30min]) o 'closed' (ya cerró).
 * Única fuente de verdad: `isWithinWindow` delega en esta función.
 */
export function getWindowState(session: SessionWindow, now: Date = new Date()): WindowState {
  const opensAt = new Date(session.starts_at).getTime() - GRACE_BEFORE_MIN * MINUTE_MS;
  const closesAt = new Date(session.ends_at).getTime() + GRACE_AFTER_MIN * MINUTE_MS;
  const t = now.getTime();
  if (t < opensAt) return "before";
  if (t > closesAt) return "closed";
  return "open";
}

/**
 * `true` si `now` cae dentro de [starts_at - 20min, ends_at + 30min].
 */
export function isWithinWindow(session: SessionWindow, now: Date = new Date()): boolean {
  return getWindowState(session, now) === "open";
}

/** Etiqueta lista para mensajes de error cuando el check-in cae fuera de horario. */
export const OUTSIDE_WINDOW_LABEL =
  `El registro está disponible desde ${GRACE_BEFORE_MIN} minutos antes del inicio de la clase ` +
  `y hasta ${GRACE_AFTER_MIN} minutos después de que termina.`;

/** Etiqueta para cuando la ventana aún no abre (windowState === 'before'). */
export const BEFORE_WINDOW_LABEL = `El registro de asistencia abre ${GRACE_BEFORE_MIN} minutos antes del inicio de la clase.`;

/** Etiqueta para cuando la ventana ya cerró (windowState === 'closed'). */
export const EXPIRED_WINDOW_LABEL = `El registro de asistencia de esta clase ya cerró (hasta ${GRACE_AFTER_MIN} minutos después del término).`;

/**
 * Predicados compartidos de "sesión EN VIVO cerrada y aplicable a un alumno".
 * Usados por `lib/asistencia/queries.ts`, `lib/admin/student-panel-queries.ts`
 * y `lib/grades/queries.ts` (corrección A3 de la revisión): cada uno arma su
 * propia consulta con su propio cliente (RLS o admin) y sus propias columnas
 * — eso NO se unifica acá — pero el criterio de elegibilidad en sí (una vez
 * que ya se tienen los datos en memoria) es el mismo en los tres, así que se
 * extrae para no triplicar la lógica de negocio.
 */

/** `true` si `now` está más allá de `ends_at + GRACE_AFTER_MIN` (ventana de asistencia ya cerrada). */
export function isSessionClosed(session: { ends_at: string }, now: number = Date.now()): boolean {
  return now > new Date(session.ends_at).getTime() + GRACE_AFTER_MIN * MINUTE_MS;
}

/**
 * `true` si una sesión cuenta como aplicable a un alumno matriculado: no fue
 * anterior a su matrícula (`enrolled_at`), está convocado a ella, y si es
 * exclusiva de un segmento (`audience='capital_inteligente'`), el alumno
 * pertenece a ese segmento.
 *
 * La convocatoria parcial (`attendee_student_ids`, migración 0106) es lo que
 * permite una clase a la que va solo parte del curso, como el examen de Role
 * Play repartido en dos sábados. Quien no está convocado NO acumula
 * inasistencia por no ir: contarlo sería castigarlo por respetar su propio
 * calendario. `null` = convoca a toda la cohorte, que es el caso de siempre.
 */
export function sessionAppliesToEnrollment(
  session: { ends_at: string; audience: string; attendee_student_ids?: string[] | null },
  enrollment: { enrolled_at: string; segment: string | null; student_id?: string },
): boolean {
  if (session.ends_at < enrollment.enrolled_at) return false;
  const convocados = session.attendee_student_ids;
  if (convocados && convocados.length > 0) {
    // Sin `student_id` no se puede decidir; se prefiere NO imputar la falta.
    if (!enrollment.student_id) return false;
    if (!convocados.includes(enrollment.student_id)) return false;
  }
  return session.audience === "all" || (session.audience === "capital_inteligente" && enrollment.segment === "capital_inteligente");
}
