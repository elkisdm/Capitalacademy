import { ROOM_OPENS_BEFORE_MIN, ROOM_CLOSES_AFTER_MIN } from "./access";

/**
 * En qué punto de su ventana está una sala (ADR-0031).
 *
 * `isWithinRoomWindow` responde sí/no, que es lo que necesita el gate del
 * servidor. La portada del invitado necesita más: "todavía no abre" y "ya
 * terminó" son el MISMO `false` y mensajes opuestos — decirle "vuelve con este
 * enlace" a quien abre el enlace al día siguiente lo manda a esperar una clase
 * que ya pasó.
 *
 * Vive acá y no en el componente para que las dos constantes sean las mismas
 * que aplica el servidor: duplicar los 30/120 minutos en la UI es exactamente
 * cómo la pantalla vuelve a desalinearse del 409.
 */
export type FaseVentana = "antes" | "abierta" | "cerrada";

const MINUTE_MS = 60_000;

export function faseDeVentana(
  startsAt: string,
  endsAt: string,
  now: Date = new Date(),
): FaseVentana {
  const abre = new Date(startsAt).getTime() - ROOM_OPENS_BEFORE_MIN * MINUTE_MS;
  const cierra = new Date(endsAt).getTime() + ROOM_CLOSES_AFTER_MIN * MINUTE_MS;
  const t = now.getTime();

  // Fechas basura no dejan a nadie afuera: la decisión real la toma el servidor
  // y devuelve un 409 explicable. Cerrar acá por un dato ilegible sería negar
  // el acceso sin poder decir por qué.
  if (Number.isNaN(abre) || Number.isNaN(cierra)) return "abierta";

  if (t < abre) return "antes";
  if (t > cierra) return "cerrada";
  return "abierta";
}

/** Cuándo abre la sala, para poder decirlo en pantalla. */
export function abreEn(startsAt: string): Date {
  return new Date(new Date(startsAt).getTime() - ROOM_OPENS_BEFORE_MIN * MINUTE_MS);
}
