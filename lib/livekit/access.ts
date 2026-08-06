import type { VideoGrant } from "./token";

/**
 * Decisión de acceso a la sala de una clase en vivo (ADR-0031).
 *
 * Todo acá es PURO: recibe los datos ya cargados y devuelve el veredicto. La
 * autenticación, la carga de la sesión y la firma viven en la ruta. Se separa
 * así porque esto es la frontera de acceso —quién entra a qué clase y con qué
 * permisos— y es lo que hay que poder ejercitar exhaustivamente en tests.
 */

/** Minutos antes del inicio en que la sala ya acepta gente. */
export const ROOM_OPENS_BEFORE_MIN = 30;

/**
 * Minutos después del fin en que la sala sigue aceptando gente.
 *
 * Deliberadamente más ancho que la ventana de asistencia (`lib/asistencia/window.ts`,
 * −20/+30): esa decide si TE CUENTAN la asistencia, y llegar tarde debe tener
 * consecuencia. Esta decide si PUEDES ENTRAR, y una clase que se alarga o un
 * alumno que se le corta el wifi y necesita reconectarse no deberían quedar
 * afuera por el reloj.
 */
export const ROOM_CLOSES_AFTER_MIN = 120;

const MINUTE_MS = 60_000;

/** Modalidades que tienen sala en vivo. Una clase grabada no la necesita. */
const LIVE_MODALITIES = new Set(["live_online", "live_in_person"]);

export type RoomSession = {
  id: string;
  cohort_id: string;
  starts_at: string;
  ends_at: string;
  modality: string | null;
};

export type RoomAccessDenial =
  | "not_live"
  | "wrong_cohort"
  | "outside_window"
  /** Tiene cuenta pero no matrícula: puede PEDIR entrar y esperar aprobación. */
  | "needs_approval"
  /** Ya pidió y el docente todavía no decide. */
  | "awaiting_approval"
  /** El docente rechazó la solicitud. */
  | "denied";

export type RoomAccessDecision =
  | { allowed: true; grant: VideoGrant; role: "teacher" | "student"; expiresAt: Date }
  | { allowed: false; reason: RoomAccessDenial };

/**
 * Nombre de la sala en LiveKit, derivado del id de la sesión.
 *
 * SIEMPRE se calcula en el servidor a partir de la sesión ya autorizada, y
 * NUNCA se acepta del cliente. Si se aceptara, pedir un token para la sala de
 * otra cohorte sería tan fácil como cambiar una cadena en la petición: el
 * servidor de LiveKit no revalida nada, confía en el token que firmamos.
 */
export function roomNameForSession(sessionId: string): string {
  return `clase-${sessionId}`;
}

/**
 * Hasta cuándo vale el token.
 *
 * Se ata al fin de la clase (más la gracia de reconexión) en vez de usar un
 * plazo fijo: un token que sobreviva a la clase es una credencial que sigue
 * abriendo una puerta que ya no debería abrirse. El piso de 15 minutos evita
 * emitir un token ya vencido a quien entra sobre la hora.
 */
export function tokenExpiryFor(session: RoomSession, now: Date): Date {
  const closesAt = new Date(session.ends_at).getTime() + ROOM_CLOSES_AFTER_MIN * MINUTE_MS;
  const floor = now.getTime() + 15 * MINUTE_MS;
  return new Date(Math.max(closesAt, floor));
}

export function isWithinRoomWindow(session: RoomSession, now: Date): boolean {
  const opensAt = new Date(session.starts_at).getTime() - ROOM_OPENS_BEFORE_MIN * MINUTE_MS;
  const closesAt = new Date(session.ends_at).getTime() + ROOM_CLOSES_AFTER_MIN * MINUTE_MS;
  const t = now.getTime();
  return t >= opensAt && t <= closesAt;
}

export type RoomAccessInput = {
  session: RoomSession;
  /** Cohorte de la URL. La sesión debe pertenecer a ella. */
  cohortId: string;
  /** ¿Tiene matrícula activa en esa cohorte? */
  hasActiveEnrollment: boolean;
  /** ¿Es staff (admin/ops) o docente/asistente de ESA cohorte? */
  isStaff: boolean;
  /**
   * Estado de su solicitud en la sala de espera (0091), si pidió entrar.
   *
   * Solo pesa cuando NO hay matrícula ni rol: quien ya está autorizado entra
   * directo, sin pasar por la espera.
   */
  solicitud?: "pending" | "approved" | "denied" | null;
  now: Date;
};

export function decideRoomAccess(input: RoomAccessInput): RoomAccessDecision {
  const { session, cohortId, hasActiveEnrollment, isStaff, now } = input;

  if (!LIVE_MODALITIES.has(session.modality ?? "")) {
    return { allowed: false, reason: "not_live" };
  }

  // Defensa en profundidad: la sesión tiene que ser de la cohorte de la URL.
  // Es el mismo chequeo que ya hace la pantalla de la clase, repetido acá
  // porque esta ruta se puede llamar directo sin pasar por esa pantalla.
  if (session.cohort_id !== cohortId) {
    return { allowed: false, reason: "wrong_cohort" };
  }

  // La ventana se evalúa ANTES de la sala de espera, y no después: un invitado
  // aprobado sigue siendo un alumno y no puede entrar a una clase que ya
  // terminó. Además, pedir entrar a una clase que no está ocurriendo tampoco
  // tiene sentido: el motivo correcto ahí es el horario, no la falta de permiso.
  if (!isStaff && !isWithinRoomWindow(session, now)) {
    return { allowed: false, reason: "outside_window" };
  }

  if (!hasActiveEnrollment && !isStaff) {
    // Sin matrícula ni rol, la sala de espera es el único camino. Se distinguen
    // los tres momentos porque a la persona hay que decirle cosas distintas:
    // "puedes pedir entrar", "ya pediste, espera" y "te rechazaron".
    if (input.solicitud === "approved") {
      return {
        allowed: true,
        role: "student",
        expiresAt: tokenExpiryFor(session, now),
        grant: grantParaRol("student", session),
      };
    }
    if (input.solicitud === "pending") return { allowed: false, reason: "awaiting_approval" };
    if (input.solicitud === "denied") return { allowed: false, reason: "denied" };
    return { allowed: false, reason: "needs_approval" };
  }

  // (El staff no tiene ventana: necesita entrar antes a probar cámara y audio, y
  // después a cerrar. Al alumno sí se le acota, para que la sala de una clase no
  // quede abierta como sala de reunión permanente.)
  const role = isStaff ? "teacher" : "student";

  return {
    allowed: true,
    role,
    expiresAt: tokenExpiryFor(session, now),
    grant: grantParaRol(role, session),
  };
}

function grantParaRol(role: "teacher" | "student", session: RoomSession): VideoGrant {
  return {
    room: roomNameForSession(session.id),
    roomJoin: true,
    // El alumno publica micrófono y cámara: es una clase, no una transmisión.
    // Quién los enciende de hecho lo decide la UI; esto solo habilita.
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    // Solo quien dicta modera. Un alumno con roomAdmin podría silenciar o
    // expulsar a sus compañeros. Quien entra aprobado desde la sala de espera
    // es un invitado: entra como alumno, nunca como docente.
    ...(role === "teacher" ? { roomAdmin: true } : {}),
  };
}
