/**
 * Estado de una grabación nativa, en lógica pura (ADR-0034).
 *
 * Todo lo que decide algo sobre una grabación —si puede pasar de un estado a
 * otro, dónde se guarda el archivo, qué le decimos al docente— vive acá y no en
 * la ruta: es lo único de este frente que se puede ejercitar sin red, sin base
 * y sin navegador.
 */

export const ESTADOS_GRABACION = [
  "starting",
  "active",
  "uploaded",
  "ingesting",
  "ready",
  "failed",
] as const;

export type EstadoGrabacion = (typeof ESTADOS_GRABACION)[number];

/*
 * Máquina de estados: starting → active → uploaded → ingesting → ready, con
 * `failed` alcanzable desde cualquier estado NO terminal. `ready` y `failed`
 * son terminales a propósito: una grabación que ya publicó su repetición no
 * puede "volver" a grabarse, y un reintento se hace con una fila nueva.
 *
 * La invariante NO se aplica acá sino en cada escritor, con updates
 * condicionales (`.eq("status", ...)` / `.in("status", ...)`) directamente en
 * la base: una función de validación en la app no protege contra dos procesos
 * concurrentes, el update condicional sí.
 */

/** Estados en los que hay un trabajo de Egress vivo para esa sala. */
export const ESTADOS_VIVOS: readonly EstadoGrabacion[] = ["starting", "active"];

/**
 * Estados en que la grabación sigue TRABAJANDO en la repetición (grabando,
 * subiendo o ingestando): lo que la UI sondea y lo que bloquea la subida
 * manual. Compartido por el control de la sala y el panel admin para que no
 * diverjan.
 */
export const ESTADOS_EN_PROCESO: readonly EstadoGrabacion[] = [
  "starting",
  "active",
  "uploaded",
  "ingesting",
];

export function estaGrabando(estado: EstadoGrabacion | null | undefined): boolean {
  return estado != null && ESTADOS_VIVOS.includes(estado);
}

/**
 * Ruta del objeto dentro del bucket `grabaciones`.
 *
 * Empieza por el id de la sesión para que borrar una clase sea borrar un
 * prefijo, y no ir a buscar objetos sueltos por su nombre.
 */
export function filePathFor(sessionId: string, recordingId: string): string {
  return `${sessionId}/${recordingId}.mp4`;
}

/**
 * Carpeta de los segmentos HLS de esa misma grabación (ADR-0034, enmienda).
 *
 * Se DERIVA de los mismos ids en vez de guardarse en una columna: dos fuentes
 * para la misma ruta son dos fuentes que se pueden contradecir, y el síntoma
 * sería una carpeta huérfana que nadie borra.
 */
export function segmentPrefixFor(sessionId: string, recordingId: string): string {
  return `${sessionId}/${recordingId}-hls`;
}

/**
 * Traduce el `status` que reporta LiveKit al estado nuestro.
 *
 * Devuelve `null` para un status desconocido: preferimos no mover la fila antes
 * que interpretar mal un estado nuevo de una versión futura de Egress.
 */
export function estadoDesdeEgress(status: string | null | undefined): EstadoGrabacion | null {
  switch (status) {
    case "EGRESS_STARTING":
      return "starting";
    case "EGRESS_ACTIVE":
    case "EGRESS_ENDING":
      return "active";
    case "EGRESS_COMPLETE":
      return "uploaded";
    case "EGRESS_FAILED":
    case "EGRESS_ABORTED":
    case "EGRESS_LIMIT_REACHED":
      return "failed";
    default:
      return null;
  }
}

/** ¿El trabajo de Egress ya terminó (bien o mal)? */
export function egressTerminado(status: string | null | undefined): boolean {
  const estado = estadoDesdeEgress(status);
  return estado === "uploaded" || estado === "failed";
}

/**
 * Lo que ve el docente en la sala. Es la única señal que tiene de que la clase
 * se está grabando o de que algo falló, así que ninguna etiqueta dice "error":
 * dicen qué pasó y qué queda por hacer.
 */
export function etiquetaEstado(estado: EstadoGrabacion | null | undefined): string {
  switch (estado) {
    case "starting":
      return "Preparando la grabación…";
    case "active":
      return "Grabando";
    case "uploaded":
      return "Grabación guardada, preparando la repetición…";
    case "ingesting":
      return "Procesando la repetición…";
    case "ready":
      return "Repetición publicada";
    case "failed":
      return "No se está grabando esta clase";
    default:
      return "No se está grabando esta clase";
  }
}

/**
 * Lo que se le dice a quien pulsa "Detener".
 *
 * Detener no es pausar: Egress cierra el archivo y no hay forma de retomar la
 * misma grabación, así que se avisa antes en vez de después.
 */
export function confirmacionDetenerGrabacion(): string {
  return "¿Detener la grabación? No se puede retomar: si vuelves a grabar, será un video aparte.";
}

/**
 * Qué se le muestra al docente cuando la grabación no está activada en el
 * despliegue (`LIVEKIT_EGRESS_ENABLED` apagada).
 *
 * No es un error: es una decisión de despliegue, y el respaldo —subir la
 * repetición a mano desde el panel— sigue disponible.
 */
export const MENSAJE_GRABACION_DESHABILITADA =
  "La grabación automática todavía no está activada. La repetición se sube a mano desde el panel.";

/**
 * Traduce un fallo del API de grabación a algo que el docente pueda leer.
 *
 * El mensaje del servidor MANDA y se muestra tal cual: ya viene escrito para
 * quien lo lee ("Entra a la sala antes de grabar."), y reescribirlo acá sería
 * inventar una causa que el navegador no conoce. Los textos propios cubren solo
 * el caso en que no llega ninguno.
 */
export function mensajeErrorGrabacion(
  status: number,
  cuerpo: { error?: string | null; missing?: string[] | null } | null,
): string {
  const base = cuerpo?.error?.trim();
  // La lista de variables que faltan es lo único accionable de un 503, y se
  // pierde si solo se muestra el mensaje: se pega al final en vez de taparla.
  const falta = cuerpo?.missing?.length ? ` Falta configurar: ${cuerpo.missing.join(", ")}.` : "";
  if (base) return `${base}${falta}`;

  if (status === 401) return "Tu sesión expiró. Vuelve a entrar a la plataforma.";
  if (status === 403) return "No puedes grabar esta clase.";
  if (status === 429) return "Demasiados intentos seguidos. Espera un momento.";
  return `No pudimos hablar con el servicio de grabación (HTTP ${status}).`;
}
