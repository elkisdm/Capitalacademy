import type { Placement, Rect, Side, Size } from "./types";

/** Aire alrededor del elemento destacado, en px. */
export const SPOTLIGHT_PADDING = 8;
/** Separación entre el elemento destacado y la tarjeta, en px. */
export const CARD_GAP = 14;
/** Margen mínimo entre la tarjeta y el borde del viewport, en px. */
export const VIEWPORT_MARGIN = 12;

/**
 * Un elemento cuenta como visible si ocupa espacio. Alcanza con eso, y es
 * justamente lo que hace falta: el sidebar de escritorio existe en el DOM
 * cuando se navega desde el teléfono (`hidden md:flex`) pero mide 0×0, igual
 * que el header móvil en escritorio (`md:hidden`). Un `display:none` no tiene
 * caja, así que este chequeo cubre el caso responsive y el de "el elemento no
 * está" con la misma regla.
 */
export function isRectVisible(rect: Rect | null | undefined): rect is Rect {
  return !!rect && rect.width > 0 && rect.height > 0;
}

function clamp(value: number, min: number, max: number): number {
  // El orden importa: con un viewport más chico que la tarjeta, `max` queda por
  // debajo de `min` y sin este cuidado la tarjeta se iría fuera de pantalla por
  // el lado contrario. Se prioriza el borde superior/izquierdo, que es el que
  // mantiene visible el título y los botones.
  if (max < min) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Recuadro de foco: el elemento más un poco de aire, recortado al viewport
 * para que el `box-shadow` que oscurece el resto no deje una franja clara
 * cuando el elemento asoma por un borde.
 */
export function computeSpotlight(
  rect: Rect,
  viewport: Size,
  padding: number = SPOTLIGHT_PADDING,
): Rect {
  const top = Math.max(0, rect.top - padding);
  const left = Math.max(0, rect.left - padding);
  const bottom = Math.min(viewport.height, rect.top + rect.height + padding);
  const right = Math.min(viewport.width, rect.left + rect.width + padding);
  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** ¿Cabe la tarjeta de ese lado del elemento, sin invadir el margen? */
function fits(
  side: Side,
  rect: Rect,
  card: Size,
  viewport: Size,
  gap: number,
  margin: number,
): boolean {
  switch (side) {
    case "bottom":
      return rect.top + rect.height + gap + card.height <= viewport.height - margin;
    case "top":
      return rect.top - gap - card.height >= margin;
    case "right":
      return rect.left + rect.width + gap + card.width <= viewport.width - margin;
    case "left":
      return rect.left - gap - card.width >= margin;
  }
}

/** Coordenadas crudas de la tarjeta para un lado dado, antes de acotar. */
function anchor(
  side: Side,
  rect: Rect,
  card: Size,
  gap: number,
): { top: number; left: number } {
  // Centrada sobre el eje libre: arriba/abajo se centra en horizontal,
  // izquierda/derecha en vertical.
  const centerX = rect.left + rect.width / 2 - card.width / 2;
  const centerY = rect.top + rect.height / 2 - card.height / 2;
  switch (side) {
    case "bottom":
      return { top: rect.top + rect.height + gap, left: centerX };
    case "top":
      return { top: rect.top - gap - card.height, left: centerX };
    case "right":
      return { top: centerY, left: rect.left + rect.width + gap };
    case "left":
      return { top: centerY, left: rect.left - gap - card.width };
  }
}

/**
 * Dónde poner la tarjeta del paso.
 *
 * Sin elemento (bienvenida y cierre) va centrada. Con elemento se prueba el
 * lado preferido del guion y después el resto en un orden fijo; gana el primero
 * donde la tarjeta entra completa. Si no entra en ninguno —un objetivo grande
 * en una pantalla chica— se cae a `bottom` acotado al viewport, que es peor que
 * un lado limpio pero sigue siendo legible, y nunca deja la tarjeta fuera de
 * pantalla.
 */
export function computeCardPosition(
  rect: Rect | null,
  card: Size,
  viewport: Size,
  opts: { prefer?: Side; gap?: number; margin?: number } = {},
): { top: number; left: number; placement: Placement } {
  const gap = opts.gap ?? CARD_GAP;
  const margin = opts.margin ?? VIEWPORT_MARGIN;

  const maxTop = viewport.height - card.height - margin;
  const maxLeft = viewport.width - card.width - margin;

  if (!isRectVisible(rect)) {
    return {
      top: clamp((viewport.height - card.height) / 2, margin, maxTop),
      left: clamp((viewport.width - card.width) / 2, margin, maxLeft),
      placement: "center",
    };
  }

  const order: Side[] = ["bottom", "top", "right", "left"];
  const candidates = opts.prefer
    ? [opts.prefer, ...order.filter((s) => s !== opts.prefer)]
    : order;

  const side = candidates.find((s) => fits(s, rect, card, viewport, gap, margin));
  const chosen: Side = side ?? "bottom";
  const raw = anchor(chosen, rect, card, gap);

  return {
    top: clamp(raw.top, margin, maxTop),
    left: clamp(raw.left, margin, maxLeft),
    placement: chosen,
  };
}
