import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { timeAgo } from "@/lib/utils/time-ago";

// Fecha de referencia fija para que las pruebas sean deterministas.
const NOW = new Date("2026-07-23T12:00:00.000Z").getTime();

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("devuelve 'hace un momento' para menos de 60 segundos", () => {
    const fecha = new Date(NOW - 30 * 1000).toISOString();
    expect(timeAgo(fecha)).toBe("hace un momento");
  });

  it("devuelve 'hace un momento' cuando la fecha es exactamente ahora", () => {
    expect(timeAgo(new Date(NOW).toISOString())).toBe("hace un momento");
  });

  it("clampa a 'hace un momento' cuando la fecha está en el futuro (diff negativo)", () => {
    const futuro = new Date(NOW + 60 * 60 * 1000).toISOString();
    expect(timeAgo(futuro)).toBe("hace un momento");
  });

  it("devuelve minutos cuando faltan menos de 60 minutos", () => {
    const fecha = new Date(NOW - 5 * 60 * 1000).toISOString();
    expect(timeAgo(fecha)).toBe("hace 5 min");
  });

  it("devuelve 'hora' en singular cuando pasó exactamente 1 hora", () => {
    const fecha = new Date(NOW - 60 * 60 * 1000).toISOString();
    expect(timeAgo(fecha)).toBe("hace 1 hora");
  });

  it("devuelve 'horas' en plural cuando pasaron varias horas", () => {
    const fecha = new Date(NOW - 5 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(fecha)).toBe("hace 5 horas");
  });

  it("devuelve 'día' en singular cuando pasó exactamente 1 día", () => {
    const fecha = new Date(NOW - 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(fecha)).toBe("hace 1 día");
  });

  it("devuelve 'días' en plural cuando pasaron varios días", () => {
    const fecha = new Date(NOW - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(fecha)).toBe("hace 5 días");
  });

  it("devuelve 'mes' en singular cuando pasaron exactamente 30 días", () => {
    const fecha = new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(fecha)).toBe("hace 1 mes");
  });

  it("devuelve 'meses' en plural cuando pasaron varios meses", () => {
    const fecha = new Date(NOW - 90 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(fecha)).toBe("hace 3 meses");
  });

  it("devuelve 'año' en singular cuando pasaron exactamente 360 días (12 meses)", () => {
    const fecha = new Date(NOW - 360 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(fecha)).toBe("hace 1 año");
  });

  it("devuelve 'años' en plural cuando pasaron varios años", () => {
    const fecha = new Date(NOW - 800 * 24 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(fecha)).toBe("hace 2 años");
  });
});
