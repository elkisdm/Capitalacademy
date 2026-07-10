import { describe, it, expect } from "vitest";
import { getWindowState, isWithinWindow } from "@/lib/asistencia/window";

// Sesión de referencia: 10:00–12:00 del 2026-07-07 (-04). La ventana válida es
// [09:40, 12:30] en ese día (mismo horario que checkin.test.ts).
const SESSION = {
  starts_at: "2026-07-07T10:00:00-04:00",
  ends_at: "2026-07-07T12:00:00-04:00",
};

describe("getWindowState", () => {
  it("'before' cuando now es anterior a la apertura (starts_at - 20min)", () => {
    expect(getWindowState(SESSION, new Date("2026-07-07T09:00:00-04:00"))).toBe("before");
  });

  it("'before' justo un instante antes del borde exacto de apertura (09:39:59)", () => {
    expect(getWindowState(SESSION, new Date("2026-07-07T09:39:59-04:00"))).toBe("before");
  });

  it("'open' en el borde exacto de apertura (09:40:00)", () => {
    expect(getWindowState(SESSION, new Date("2026-07-07T09:40:00-04:00"))).toBe("open");
  });

  it("'open' dentro de la clase", () => {
    expect(getWindowState(SESSION, new Date("2026-07-07T10:30:00-04:00"))).toBe("open");
  });

  it("'open' en el borde exacto de cierre (12:30:00)", () => {
    expect(getWindowState(SESSION, new Date("2026-07-07T12:30:00-04:00"))).toBe("open");
  });

  it("'closed' justo un instante después del borde exacto de cierre (12:30:01)", () => {
    expect(getWindowState(SESSION, new Date("2026-07-07T12:30:01-04:00"))).toBe("closed");
  });

  it("'closed' cuando now es posterior al cierre (ends_at + 30min)", () => {
    expect(getWindowState(SESSION, new Date("2026-07-07T13:00:00-04:00"))).toBe("closed");
  });
});

describe("isWithinWindow (delega en getWindowState)", () => {
  it("es true exactamente cuando getWindowState devuelve 'open'", () => {
    const inside = new Date("2026-07-07T10:30:00-04:00");
    expect(getWindowState(SESSION, inside)).toBe("open");
    expect(isWithinWindow(SESSION, inside)).toBe(true);
  });

  it("es false cuando getWindowState devuelve 'before' o 'closed'", () => {
    const before = new Date("2026-07-07T09:00:00-04:00");
    const after = new Date("2026-07-07T13:00:00-04:00");
    expect(isWithinWindow(SESSION, before)).toBe(false);
    expect(isWithinWindow(SESSION, after)).toBe(false);
  });
});
