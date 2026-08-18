import type { VideoGrant } from "./token";
import {
  isLiveModality,
  isWithinRoomWindow,
  roomNameForSession,
  tokenExpiryFor,
  type RoomSession,
} from "./access";

/**
 * Decisión de acceso de un INVITADO SIN CUENTA a una sala en vivo (ADR-0035,
 * migración 0099).
 *
 * Vive aparte de `decideRoomAccess` a propósito. Aquel gate resuelve a quien
 * tiene cuenta —matrícula, rol, sala de espera— y está cubierto por tests que
 * describen esos caminos; meterle un cuarto, con otra fuente de identidad y otra
 * credencial, lo volvería más difícil de razonar justo donde no conviene. Lo que
 * SÍ se comparte es lo que debe ser idéntico en ambos: la modalidad en vivo, la
 * ventana horaria y el nombre de la sala.
 *
 * La regla que sostiene todo: **el invitado no toca la sala hasta que el docente
 * lo acepta.** Mientras espera no hay token, igual que en 0091. Un invitado con
 * presencia oculta y canal de datos abierto ya está dentro para cualquier efecto
 * práctico.
 */

/** Estado de la solicitud de un invitado (`room_guests.status`). */
export type GuestStatus = "pending" | "approved" | "denied";

export type GuestAccessDenial =
  /** La sala no admite invitados: el flag `guest_access` está apagado. */
  | "guests_not_allowed"
  /** La clase no es en vivo (una grabada no tiene sala). */
  | "not_live"
  /** Fuera de la ventana −30/+120 min. */
  | "outside_window"
  /** No hay solicitud: todavía no escribió su nombre, o perdió la cookie. */
  | "no_request"
  /** Pidió entrar y el docente no ha decidido. */
  | "awaiting_approval"
  /** El docente lo rechazó. */
  | "denied";

export type GuestAccessDecision =
  | { allowed: true; grant: VideoGrant; identity: string; name: string; expiresAt: Date }
  | { allowed: false; reason: GuestAccessDenial };

/** Nombre mínimo y máximo aceptable. El CHECK de la tabla replica estos límites. */
const NAME_MIN = 2;
const NAME_MAX = 40;

/**
 * Sufijo obligatorio del nombre visible.
 *
 * Sin esto, un invitado puede escribir el nombre de la docente y aparecer en la
 * grilla como ella. El sufijo lo pone el SERVIDOR al firmar el token, así que no
 * hay forma de que el cliente lo omita: no se acepta un nombre visible del
 * navegador, se construye acá.
 */
export const GUEST_SUFFIX = " (invitado)";

/**
 * Limpia el nombre que escribió el invitado, o devuelve null si no sirve.
 *
 * Quita caracteres de control (incluidos los de dirección bidi, con los que se
 * puede maquillar cómo se lee un nombre) y colapsa los espacios, para que
 * "Diego            " y "Diego" sean lo mismo y nadie empuje su nombre fuera de
 * la vista con relleno.
 */
export function sanitizeGuestName(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  const limpio = raw
    // Controles C0/C1, espacios de ancho cero y marcas bidi: invisibles al leer,
    // pero sirven para maquillar cómo se ve un nombre en la grilla.
    .replace(
      /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (limpio.length < NAME_MIN || limpio.length > NAME_MAX) return null;
  return limpio;
}

/**
 * Identidad del invitado en LiveKit.
 *
 * Va prefijada para que jamás pueda colisionar con la identidad de un usuario
 * con cuenta, que es el UUID pelado del perfil (`lib/livekit/token.ts`). Sin el
 * prefijo, una identidad repetida haría que LiveKit desconecte al participante
 * anterior: alguien podría sacar a otro de la sala adivinando su id.
 */
export function guestIdentity(guestId: string): string {
  return `guest-${guestId}`;
}

/** Nombre visible en la sala, siempre marcado como invitado. */
export function guestDisplayName(name: string): string {
  return `${name}${GUEST_SUFFIX}`;
}

/**
 * Nombre de la cookie que lleva la credencial del invitado.
 *
 * Va POR SESIÓN para que alguien pueda ser invitado en dos salas a la vez sin
 * que una pise a la otra. Igual, el servidor nunca confía solo en el nombre: al
 * leer la fila filtra también por `session_id`, así que la cookie de la clase A
 * no sirve en la clase B ni renombrándola.
 */
export function guestCookieName(sessionId: string): string {
  return `ca_guest_${sessionId}`;
}

export type GuestAccessInput = {
  session: RoomSession;
  /** `class_sessions.guest_access`: si está apagado, acá no entra ningún invitado. */
  guestAccess: boolean;
  /** La fila de `room_guests` que nombra su cookie, si existe y es de ESTA sesión. */
  guest: { id: string; display_name: string; status: GuestStatus } | null;
  now: Date;
};

export function decideGuestAccess(input: GuestAccessInput): GuestAccessDecision {
  const { session, guestAccess, guest, now } = input;

  if (!isLiveModality(session.modality)) {
    return { allowed: false, reason: "not_live" };
  }

  // Antes que nada: esta sala tiene que estar abierta a invitados. Es el gate que
  // hace que un enlace filtrado no sirva de nada en una clase real.
  if (!guestAccess) {
    return { allowed: false, reason: "guests_not_allowed" };
  }

  // El invitado SÍ tiene ventana, igual que un alumno. El único sin ventana es el
  // staff, que necesita entrar antes a probar cámara y quedarse después a cerrar.
  if (!isWithinRoomWindow(session, now)) {
    return { allowed: false, reason: "outside_window" };
  }

  if (!guest) return { allowed: false, reason: "no_request" };
  if (guest.status === "pending") return { allowed: false, reason: "awaiting_approval" };
  if (guest.status === "denied") return { allowed: false, reason: "denied" };

  return {
    allowed: true,
    identity: guestIdentity(guest.id),
    name: guestDisplayName(guest.display_name),
    expiresAt: tokenExpiryFor(session, now),
    grant: {
      room: roomNameForSession(session.id),
      roomJoin: true,
      // Aprobado, participa como uno más: es una reunión, no una transmisión.
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // NUNCA `roomAdmin`. Un invitado con moderación podría silenciar o expulsar
      // a los alumnos —y ni siquiera sabemos quién es.
    },
  };
}
