import { describe, it, expect } from "vitest";
import {
  liveMessage,
  tokenErrorMessage,
  pickMainParticipant,
  stripParticipants,
  participantCountLabel,
  type TileParticipant,
} from "../room-state";

function tile(overrides: Partial<TileParticipant> = {}): TileParticipant {
  return {
    identity: "p1",
    name: "Ana",
    isLocal: false,
    isSpeaking: false,
    hasVideo: false,
    isHost: false,
    ...overrides,
  };
}

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

describe("pickMainParticipant", () => {
  it("devuelve null cuando no hay nadie", () => {
    expect(pickMainParticipant([])).toBeNull();
  });

  it("destaca a quien está hablando", () => {
    const hablando = tile({ identity: "b", isSpeaking: true });
    expect(pickMainParticipant([tile({ identity: "a" }), hablando])).toBe(hablando);
  });

  it("nunca se destaca uno mismo si hay alguien más", () => {
    // Verse a sí mismo en grande mientras hablas es desorientador.
    const yo = tile({ identity: "yo", isLocal: true, isSpeaking: true });
    const otro = tile({ identity: "otro" });
    expect(pickMainParticipant([yo, otro])).toBe(otro);
  });

  it("se destaca uno mismo si está solo en la sala", () => {
    const yo = tile({ identity: "yo", isLocal: true });
    expect(pickMainParticipant([yo])).toBe(yo);
  });

  it("sin nadie hablando, prefiere a quien dicta la clase", () => {
    const docente = tile({ identity: "doc", isHost: true });
    expect(pickMainParticipant([tile({ identity: "a" }), docente])).toBe(docente);
  });

  it("hablar le gana a dictar la clase", () => {
    const docente = tile({ identity: "doc", isHost: true });
    const alumnoHablando = tile({ identity: "al", isSpeaking: true });
    expect(pickMainParticipant([docente, alumnoHablando])).toBe(alumnoHablando);
  });

  it("sin quien hable ni docente, prefiere a quien tiene cámara", () => {
    const conCamara = tile({ identity: "cam", hasVideo: true });
    expect(pickMainParticipant([tile({ identity: "a" }), conCamara])).toBe(conCamara);
  });

  it("como último recurso toma al primero", () => {
    const primero = tile({ identity: "a" });
    expect(pickMainParticipant([primero, tile({ identity: "b" })])).toBe(primero);
  });
});

describe("stripParticipants", () => {
  it("saca de la tira al que está destacado", () => {
    const a = tile({ identity: "a" });
    const b = tile({ identity: "b" });
    expect(stripParticipants([a, b], a)).toEqual([b]);
  });

  it("conserva el orden de llegada", () => {
    // Si la tira se reordenara al hablar, las miniaturas bailarían solas.
    const lista = [tile({ identity: "a" }), tile({ identity: "b" }), tile({ identity: "c" })];
    expect(stripParticipants(lista, lista[1]).map((p) => p.identity)).toEqual(["a", "c"]);
  });

  it("sin destacado devuelve todos", () => {
    const lista = [tile({ identity: "a" })];
    expect(stripParticipants(lista, null)).toEqual(lista);
  });
});

describe("participantCountLabel", () => {
  it("concuerda en singular y plural", () => {
    expect(participantCountLabel(1)).toBe("1 persona");
    expect(participantCountLabel(3)).toBe("3 personas");
    expect(participantCountLabel(0)).toBe("0 personas");
  });
});
