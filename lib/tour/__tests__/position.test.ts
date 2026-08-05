import { describe, it, expect } from "vitest";
import {
  isRectVisible,
  computeSpotlight,
  computeCardPosition,
  SPOTLIGHT_PADDING,
  CARD_GAP,
  VIEWPORT_MARGIN,
} from "@/lib/tour/position";
import type { Rect, Size } from "@/lib/tour/types";

const DESKTOP: Size = { width: 1440, height: 900 };
const PHONE: Size = { width: 390, height: 780 };
const CARD: Size = { width: 340, height: 200 };

/** ¿La tarjeta entra completa en el viewport, respetando el margen? */
function dentroDelViewport(
  pos: { top: number; left: number },
  card: Size,
  viewport: Size,
) {
  return (
    pos.top >= 0 &&
    pos.left >= 0 &&
    pos.top + card.height <= viewport.height &&
    pos.left + card.width <= viewport.width
  );
}

describe("isRectVisible", () => {
  it("acepta un rectángulo con alto y ancho", () => {
    expect(isRectVisible({ top: 10, left: 10, width: 100, height: 40 })).toBe(true);
  });

  it("rechaza null y undefined", () => {
    expect(isRectVisible(null)).toBe(false);
    expect(isRectVisible(undefined)).toBe(false);
  });

  it("rechaza un elemento con display:none (0×0)", () => {
    expect(isRectVisible({ top: 0, left: 0, width: 0, height: 0 })).toBe(false);
  });

  it("rechaza un rectángulo con una sola dimensión en cero", () => {
    expect(isRectVisible({ top: 0, left: 0, width: 100, height: 0 })).toBe(false);
    expect(isRectVisible({ top: 0, left: 0, width: 0, height: 100 })).toBe(false);
  });
});

describe("computeSpotlight", () => {
  it("agrega aire alrededor del elemento", () => {
    const rect: Rect = { top: 100, left: 200, width: 300, height: 80 };
    const out = computeSpotlight(rect, DESKTOP);
    expect(out).toEqual({
      top: 100 - SPOTLIGHT_PADDING,
      left: 200 - SPOTLIGHT_PADDING,
      width: 300 + SPOTLIGHT_PADDING * 2,
      height: 80 + SPOTLIGHT_PADDING * 2,
    });
  });

  it("no se sale por el borde superior ni izquierdo", () => {
    const out = computeSpotlight({ top: 0, left: 0, width: 100, height: 50 }, DESKTOP);
    expect(out.top).toBe(0);
    expect(out.left).toBe(0);
  });

  it("recorta contra el borde inferior y derecho", () => {
    const out = computeSpotlight(
      { top: 860, left: 1400, width: 200, height: 200 },
      DESKTOP,
    );
    expect(out.top + out.height).toBeLessThanOrEqual(DESKTOP.height);
    expect(out.left + out.width).toBeLessThanOrEqual(DESKTOP.width);
  });

  it("nunca devuelve dimensiones negativas para un elemento fuera de pantalla", () => {
    const out = computeSpotlight(
      { top: 2000, left: 3000, width: 100, height: 100 },
      DESKTOP,
    );
    expect(out.width).toBeGreaterThanOrEqual(0);
    expect(out.height).toBeGreaterThanOrEqual(0);
  });

  it("acepta un padding explícito", () => {
    const out = computeSpotlight({ top: 100, left: 100, width: 50, height: 50 }, DESKTOP, 0);
    expect(out).toEqual({ top: 100, left: 100, width: 50, height: 50 });
  });
});

describe("computeCardPosition", () => {
  it("centra la tarjeta cuando no hay elemento", () => {
    const out = computeCardPosition(null, CARD, DESKTOP);
    expect(out.placement).toBe("center");
    expect(out.left).toBe((DESKTOP.width - CARD.width) / 2);
    expect(out.top).toBe((DESKTOP.height - CARD.height) / 2);
  });

  it("centra también cuando el elemento mide 0×0", () => {
    const out = computeCardPosition(
      { top: 0, left: 0, width: 0, height: 0 },
      CARD,
      DESKTOP,
    );
    expect(out.placement).toBe("center");
  });

  it("por defecto va debajo del elemento", () => {
    const rect: Rect = { top: 100, left: 400, width: 300, height: 60 };
    const out = computeCardPosition(rect, CARD, DESKTOP);
    expect(out.placement).toBe("bottom");
    expect(out.top).toBe(rect.top + rect.height + CARD_GAP);
  });

  it("respeta el lado preferido cuando hay espacio", () => {
    const rect: Rect = { top: 300, left: 40, width: 200, height: 60 };
    const out = computeCardPosition(rect, CARD, DESKTOP, { prefer: "right" });
    expect(out.placement).toBe("right");
    expect(out.left).toBe(rect.left + rect.width + CARD_GAP);
  });

  it("descarta el lado preferido si la tarjeta no entra", () => {
    // Elemento pegado al borde derecho: "right" no cabe.
    const rect: Rect = { top: 300, left: 1300, width: 120, height: 60 };
    const out = computeCardPosition(rect, CARD, DESKTOP, { prefer: "right" });
    expect(out.placement).not.toBe("right");
    expect(dentroDelViewport(out, CARD, DESKTOP)).toBe(true);
  });

  it("se va arriba cuando abajo no cabe", () => {
    const rect: Rect = { top: 700, left: 400, width: 300, height: 120 };
    const out = computeCardPosition(rect, CARD, DESKTOP);
    expect(out.placement).toBe("top");
    expect(out.top).toBe(rect.top - CARD_GAP - CARD.height);
  });

  it("cae a los lados cuando no hay espacio ni arriba ni abajo", () => {
    // Elemento alto que ocupa casi toda la pantalla, con hueco a la derecha.
    const rect: Rect = { top: 10, left: 20, width: 300, height: 860 };
    const out = computeCardPosition(rect, CARD, DESKTOP);
    expect(["right", "left"]).toContain(out.placement);
    expect(dentroDelViewport(out, CARD, DESKTOP)).toBe(true);
  });

  it("mantiene la tarjeta dentro de pantalla cuando el elemento está en una esquina", () => {
    const esquinas: Rect[] = [
      { top: 0, left: 0, width: 60, height: 40 },
      { top: 0, left: DESKTOP.width - 60, width: 60, height: 40 },
      { top: DESKTOP.height - 40, left: 0, width: 60, height: 40 },
      { top: DESKTOP.height - 40, left: DESKTOP.width - 60, width: 60, height: 40 },
    ];
    for (const rect of esquinas) {
      const out = computeCardPosition(rect, CARD, DESKTOP);
      expect(dentroDelViewport(out, CARD, DESKTOP)).toBe(true);
    }
  });

  it("en teléfono nunca deja la tarjeta fuera de pantalla", () => {
    const cardMovil: Size = { width: PHONE.width - 32, height: 220 };
    const objetivos: Rect[] = [
      { top: 8, left: 8, width: 44, height: 44 }, // hamburguesa
      { top: 200, left: 16, width: PHONE.width - 32, height: 120 }, // banda ancha
      { top: 600, left: 16, width: PHONE.width - 32, height: 300 }, // lista larga
    ];
    for (const rect of objetivos) {
      const out = computeCardPosition(rect, cardMovil, PHONE);
      expect(dentroDelViewport(out, cardMovil, PHONE)).toBe(true);
    }
  });

  it("cae a 'bottom' acotado cuando el elemento no deja espacio en ningún lado", () => {
    const rect: Rect = { top: 0, left: 0, width: PHONE.width, height: PHONE.height };
    const out = computeCardPosition(rect, CARD, PHONE);
    expect(out.placement).toBe("bottom");
    expect(dentroDelViewport(out, CARD, PHONE)).toBe(true);
  });

  it("prioriza el borde superior/izquierdo si la tarjeta es más grande que el viewport", () => {
    const gigante: Size = { width: 500, height: 900 };
    const out = computeCardPosition(null, gigante, PHONE);
    expect(out.top).toBe(VIEWPORT_MARGIN);
    expect(out.left).toBe(VIEWPORT_MARGIN);
  });

  it("centra la tarjeta sobre el eje libre del elemento", () => {
    const rect: Rect = { top: 100, left: 400, width: 300, height: 60 };
    const out = computeCardPosition(rect, CARD, DESKTOP);
    const centroElemento = rect.left + rect.width / 2;
    const centroTarjeta = out.left + CARD.width / 2;
    expect(centroTarjeta).toBeCloseTo(centroElemento, 5);
  });

  it("acepta gap y margen explícitos", () => {
    const rect: Rect = { top: 100, left: 400, width: 300, height: 60 };
    const out = computeCardPosition(rect, CARD, DESKTOP, { gap: 40, margin: 0 });
    expect(out.top).toBe(rect.top + rect.height + 40);
  });
});
