import { describe, it, expect } from "vitest";
import { liveMessage, tokenErrorMessage, mensajeEspera } from "../room-state";

describe("liveMessage", () => {
  it("da un texto para cada estado", () => {
    for (const s of ["idle", "connecting", "connected", "reconnecting", "disconnected", "error"] as const) {
      expect(liveMessage(s).title.length).toBeGreaterThan(0);
    }
  });

  it("solo ofrece reintentar cuando tiene sentido", () => {
    expect(liveMessage("error").canRetry).toBe(true);
    expect(liveMessage("disconnected").canRetry).toBe(true);
    expect(liveMessage("connecting").canRetry).toBe(false);
    // Reconectando NO ofrece reintentar: el SDK ya lo está haciendo solo, y un
    // botón ahí invita a recargar y perder la sesión.
    expect(liveMessage("reconnecting").canRetry).toBe(false);
  });

  it("al reconectar le dice a la persona que no cierre", () => {
    expect(liveMessage("reconnecting").detail).toMatch(/no cierres/i);
  });
});

describe("tokenErrorMessage", () => {
  it("prefiere el mensaje del servidor cuando llega", () => {
    expect(tokenErrorMessage(403, "No estás matriculado en esta clase.")).toBe(
      "No estás matriculado en esta clase.",
    );
  });

  it("traduce los códigos cuando el servidor no manda mensaje", () => {
    expect(tokenErrorMessage(401)).toMatch(/sesión/i);
    expect(tokenErrorMessage(403)).toMatch(/matriculado/i);
    expect(tokenErrorMessage(404)).toMatch(/no encontramos/i);
    expect(tokenErrorMessage(429)).toMatch(/espera/i);
    expect(tokenErrorMessage(503)).toMatch(/no est/i);
  });

  it("tiene una salida para un código inesperado", () => {
    expect(tokenErrorMessage(500)).toMatch(/no pudimos/i);
  });

  it("un mensaje vacío del servidor no deja al alumno sin texto", () => {
    expect(tokenErrorMessage(500, "")).toMatch(/no pudimos/i);
    expect(tokenErrorMessage(500, null)).toMatch(/no pudimos/i);
  });
});

describe("mensajeEspera", () => {
  it("distingue los tres momentos, que exigen decir cosas distintas", () => {
    expect(mensajeEspera("puede_pedir").title).toMatch(/no estás en esta clase/i);
    expect(mensajeEspera("esperando").title).toMatch(/esperando/i);
    expect(mensajeEspera("rechazado").title).toMatch(/no te aceptaron/i);
  });

  it("al esperar pide no cerrar la ventana", () => {
    // Sin encuadrar la espera, la persona recarga a los diez segundos.
    expect(mensajeEspera("esperando").detail).toMatch(/deja esta ventana abierta/i);
  });

  it("al rechazar ofrece una salida en vez de dejar a la persona colgada", () => {
    expect(mensajeEspera("rechazado").detail).toMatch(/escríbele|coordinación/i);
  });

  it("ninguno ofrece reintentar: reintentar solo genera ruido al docente", () => {
    for (const e of ["puede_pedir", "esperando", "rechazado"] as const) {
      expect(mensajeEspera(e).canRetry).toBe(false);
    }
  });
});
