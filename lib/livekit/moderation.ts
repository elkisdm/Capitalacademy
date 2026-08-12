/**
 * Lógica pura del panel de moderación (ADR-0031).
 *
 * El componente vive dentro del contexto de LiveKit y no se puede testear en
 * este repo (no hay jsdom), así que todo lo que decide algo vive acá.
 */

export type ModerarAccion = "mute" | "remove";

/**
 * Acciones sobre la sala entera, no sobre una persona.
 *
 * Van separadas de `ModerarAccion` a propósito: no llevan destinatario, y
 * mezclarlas obligaría a que media UI acepte un nombre que no existe.
 */
export type ModerarAccionMasiva = "mute_all" | "end_room";

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

/**
 * Confirmación antes de silenciar a toda la sala.
 *
 * Dice el número porque es lo que distingue "silencio a los tres que quedaron
 * hablando" de "corto a la clase entera", y aclara que es reversible: quien
 * quiera hablar vuelve a abrir su micrófono sin pedir permiso.
 */
export function confirmacionSilenciarATodos(cantidad: number): string {
  const quienes = cantidad === 1 ? "a la única persona conectada" : `a las ${cantidad} personas conectadas`;
  return `¿Silenciar ${quienes}? Cada una puede volver a abrir su micrófono cuando quiera hablar.`;
}

/**
 * Confirmación antes de terminar la clase para todos.
 *
 * Es la acción más destructiva de la sala —saca a todo el mundo de una vez— y
 * la única que un clic distraído no puede deshacer sin que cada persona vuelva
 * a entrar por su cuenta. Por eso el texto nombra la consecuencia completa.
 */
export function confirmacionTerminarClase(cantidad: number): string {
  const quienes = cantidad === 1 ? "1 persona" : `${cantidad} personas`;
  return `¿Terminar la clase para todos? Se desconectará a las ${quienes} que están en la sala y se cerrará la clase.`;
}

/** Mensaje de resultado de una acción sobre la sala entera. */
export function resultadoMasivo(
  accion: ModerarAccionMasiva,
  ok: boolean,
  silenciados = 0,
): string {
  if (!ok) {
    return accion === "mute_all"
      ? "No se pudo silenciar a todos."
      : "No se pudo terminar la clase.";
  }
  if (accion === "end_room") return "Terminaste la clase para todos.";
  // Cero silenciados no es un fallo: es que nadie tenía el micrófono abierto, y
  // decirlo evita que el docente vuelva a pulsar creyendo que no funcionó.
  if (silenciados === 0) return "Nadie tenía el micrófono abierto.";
  return silenciados === 1 ? "Silenciaste a 1 persona." : `Silenciaste a ${silenciados} personas.`;
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
