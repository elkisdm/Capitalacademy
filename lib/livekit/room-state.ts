/**
 * Lógica pura de la sala en vivo (ADR-0031).
 *
 * El componente de la clase es inevitablemente DOM y SDK, y en este proyecto
 * los componentes React no se testean (no hay jsdom, ver `vitest.config.ts`).
 * Por eso todo lo que se puede decidir sin un navegador vive acá: qué se le
 * dice al alumno según el estado de la conexión y cómo se traduce un rechazo
 * del token. El interior de la sala lo pone `<VideoConference />`.
 */

/** Estados de la pantalla, no del SDK: son los que el alumno percibe. */
export type LiveScreenState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type LiveMessage = {
  /** Texto principal, en la voz del producto. */
  title: string;
  /** Detalle opcional; null cuando el título se basta solo. */
  detail: string | null;
  /** ¿Corresponde ofrecer reintentar? */
  canRetry: boolean;
};

const MESSAGES: Record<LiveScreenState, LiveMessage> = {
  idle: {
    title: "Entra a la clase",
    detail: "Se abrirá aquí mismo, sin salir de la plataforma.",
    canRetry: false,
  },
  connecting: {
    title: "Conectando…",
    detail: "Estamos preparando tu cámara y micrófono.",
    canRetry: false,
  },
  connected: { title: "En la clase", detail: null, canRetry: false },
  reconnecting: {
    title: "Se cortó la conexión, reintentando…",
    // Encuadra la espera: sin esto, el alumno recarga la página y pierde el sitio.
    detail: "No cierres la ventana. Si tu internet vuelve, te reconectamos solos.",
    canRetry: false,
  },
  disconnected: {
    title: "Saliste de la clase",
    detail: "Puedes volver a entrar mientras la clase siga en curso.",
    canRetry: true,
  },
  error: {
    title: "No pudimos conectarte",
    detail: "Revisa tu conexión y vuelve a intentar. Si sigue fallando, escríbenos desde Ayuda.",
    canRetry: true,
  },
};

export function liveMessage(state: LiveScreenState): LiveMessage {
  return MESSAGES[state];
}

/**
 * Traduce el motivo de un fallo de la API de token a algo accionable.
 *
 * El servidor ya manda un mensaje en español; esto cubre los casos en que no
 * llega ninguno (caída de red, respuesta sin cuerpo) para no dejar al alumno
 * con un "error" pelado.
 */
/**
 * Estados de la sala de espera (0091) tal como los percibe quien pide entrar.
 *
 * Se distinguen los tres porque hay que decirle cosas distintas: puede pedir, ya
 * pidió, o lo rechazaron. Colapsarlos en "no puedes entrar" deja a la persona
 * sin saber si le falta hacer algo.
 */
export type EsperaEstado = "puede_pedir" | "esperando" | "rechazado";

export function mensajeEspera(estado: EsperaEstado): LiveMessage {
  switch (estado) {
    case "puede_pedir":
      return {
        title: "No estás en esta clase",
        detail: "Puedes pedirle al docente que te deje entrar.",
        canRetry: false,
      };
    case "esperando":
      return {
        title: "Esperando que te acepten",
        // Encuadra la espera: sin esto la persona recarga a los diez segundos.
        detail: "El docente verá tu solicitud en su pantalla. Deja esta ventana abierta.",
        canRetry: false,
      };
    case "rechazado":
      return {
        title: "No te aceptaron en esta clase",
        detail: "Si crees que es un error, escríbele al docente o a la coordinación.",
        canRetry: false,
      };
  }
}

export function tokenErrorMessage(status: number, serverMessage?: string | null): string {
  if (serverMessage) return serverMessage;
  if (status === 401) return "Tu sesión expiró. Vuelve a entrar a la plataforma.";
  if (status === 403) return "No estás matriculado en esta clase.";
  if (status === 404) return "No encontramos esta clase.";
  if (status === 429) return "Demasiados intentos seguidos. Espera un momento.";
  if (status === 503) return "Las clases en vivo no están disponibles por ahora.";
  return "No pudimos conectarte a la clase.";
}
