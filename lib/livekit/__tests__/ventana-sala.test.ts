import { describe, it, expect } from "vitest";
import { faseDeVentana, abreEn } from "@/lib/livekit/ventana-sala";
import { isWithinRoomWindow } from "@/lib/livekit/access";

const INICIO = "2026-08-19T22:00:00.000Z"; // 19:00 en Chile
const FIN = "2026-08-20T00:00:00.000Z"; // 21:00 en Chile

const en = (iso: string) => new Date(iso);

describe("faseDeVentana", () => {
  it("antes de que abra: 'antes'", () => {
    // 31 minutos antes del inicio: la sala abre 30 antes.
    expect(faseDeVentana(INICIO, FIN, en("2026-08-19T21:29:00.000Z"))).toBe("antes");
  });

  it("justo cuando abre ya es 'abierta'", () => {
    expect(faseDeVentana(INICIO, FIN, en("2026-08-19T21:30:00.000Z"))).toBe("abierta");
  });

  it("durante la clase: 'abierta'", () => {
    expect(faseDeVentana(INICIO, FIN, en("2026-08-19T23:00:00.000Z"))).toBe("abierta");
  });

  it("dentro de las 2 horas de gracia sigue 'abierta'", () => {
    expect(faseDeVentana(INICIO, FIN, en("2026-08-20T01:59:00.000Z"))).toBe("abierta");
  });

  it("pasada la gracia: 'cerrada' — NO 'antes'", () => {
    // El caso que motivó separar las fases: el enlace reenviado se abre al día
    // siguiente y antes decía "vuelve con este mismo enlace".
    expect(faseDeVentana(INICIO, FIN, en("2026-08-21T12:00:00.000Z"))).toBe("cerrada");
  });

  it("una fecha ilegible no deja a nadie afuera", () => {
    expect(faseDeVentana("no-es-fecha", FIN, en("2026-08-21T12:00:00.000Z"))).toBe("abierta");
  });

  it("coincide con isWithinRoomWindow, que es el gate real del servidor", () => {
    const sesion = { id: "s1", cohort_id: "c1", starts_at: INICIO, ends_at: FIN, modality: "live" };
    for (const iso of [
      "2026-08-19T21:29:00.000Z",
      "2026-08-19T21:30:00.000Z",
      "2026-08-19T23:00:00.000Z",
      "2026-08-20T01:59:00.000Z",
      "2026-08-20T02:01:00.000Z",
      "2026-08-21T12:00:00.000Z",
    ]) {
      const abierta = faseDeVentana(INICIO, FIN, en(iso)) === "abierta";
      expect(abierta).toBe(isWithinRoomWindow(sesion, en(iso)));
    }
  });
});

describe("abreEn", () => {
  it("son 30 minutos antes del inicio", () => {
    expect(abreEn(INICIO).toISOString()).toBe("2026-08-19T21:30:00.000Z");
  });
});
