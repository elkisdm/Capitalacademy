/**
 * Lógica pura del panel de moderación (ADR-0031).
 *
 * El componente vive dentro del contexto de LiveKit y no se puede testear en
 * este repo (no hay jsdom), así que todo lo que decide algo vive acá.
 */

export type ModerarAccion = "mute" | "remove";

export type ParticipanteModerable = {
  identity: string;
  name: string;
  /** ¿Tiene el micrófono abierto ahora mismo? */
  micAbierto: boolean;
};

/** Etiqueta del botón según el estado del micrófono de esa persona. */
export function etiquetaSilenciar(micAbierto: boolean): string {
  // Silenciar a quien ya está en silencio no hace nada: mejor decirlo que
  // ofrecer un botón que no cambia nada.
  return micAbierto ? "Silenciar" : "Ya está en silencio";
}

/**
 * Texto de confirmación antes de sacar a alguien.
 *
 * Sacar a un alumno de su clase es de las pocas acciones de esta pantalla que no
 * se pueden deshacer sin que la persona vuelva a entrar por su cuenta, así que
 * se confirma con el nombre a la vista: es lo que evita el clic equivocado en la
 * fila de al lado.
 */
export function confirmacionSacar(nombre: string): string {
  return `¿Sacar a ${nombre} de la clase? Podrá volver a entrar si tiene el enlace.`;
}

/** Mensaje de resultado, en la voz del producto. */
export function resultadoModeracion(
  accion: ModerarAccion,
  nombre: string,
  ok: boolean,
): string {
  if (!ok) return `No se pudo completar la acción sobre ${nombre}.`;
  return accion === "mute" ? `Silenciaste a ${nombre}.` : `Sacaste a ${nombre} de la clase.`;
}

/**
 * Orden del panel: primero quien tiene el micrófono abierto.
 *
 * Es el orden en que la información sirve: si el docente abre este panel es
 * casi siempre porque alguien está sonando y hay que encontrarlo rápido. A
 * igualdad, alfabético, para que la lista no baile entre renders.
 */
export function ordenarParaModerar(
  participantes: readonly ParticipanteModerable[],
): ParticipanteModerable[] {
  return [...participantes].sort((a, b) => {
    if (a.micAbierto !== b.micAbierto) return a.micAbierto ? -1 : 1;
    return a.name.localeCompare(b.name, "es");
  });
}
