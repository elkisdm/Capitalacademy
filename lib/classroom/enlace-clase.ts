import { meetingPath } from "@/lib/livekit/meeting-code";

/**
 * A dónde entra el alumno a una clase en vivo.
 *
 * Regla: **si la clase tiene un enlace externo cargado a mano, ese gana**. Que
 * alguien haya pegado un Zoom o un Meet en `meeting_url` significa que esa clase
 * se dicta ahí y no en la sala de la plataforma. La sala propia (`code`) es el
 * camino por defecto (ADR-0031) para todas las demás.
 *
 * Antes esta decisión estaba escrita dos veces y al revés: el correo de
 * recordatorio priorizaba el enlace externo y la UI priorizaba la sala propia.
 * El 26-ago eso mandó a los alumnos del Diplomado a dos lugares distintos para
 * la misma clase — el correo al Zoom, los botones de la plataforma a una sala
 * vacía. De ahí que la regla viva acá y no en cada pantalla.
 *
 * Devuelve `null` si la clase no tiene ninguno de los dos (no se puede entrar).
 */
export function joinHrefFor(session: {
  meeting_url?: string | null;
  code?: string | null;
}): string | null {
  const externo = session.meeting_url?.trim();
  if (externo) return externo;
  return session.code ? meetingPath(session.code) : null;
}

/** `true` si el destino es un enlace externo (Zoom/Meet) y no la sala propia. */
export function isExternalJoinHref(href: string | null): boolean {
  return Boolean(href && !href.startsWith("/sala/"));
}
