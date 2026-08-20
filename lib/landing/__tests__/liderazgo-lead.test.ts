import { describe, expect, it } from "vitest";
import {
  buildLiderazgoLeadPayload,
  LIDERAZGO_LEAD_SOURCE,
  normalizarDesafios,
} from "../liderazgo-lead";

describe("buildLiderazgoLeadPayload", () => {
  it("fija programa liderazgo y source de la landing, y recorta espacios", () => {
    const payload = buildLiderazgoLeadPayload({
      full_name: "  Ana Rojas ",
      email: " ana@ejemplo.cl ",
      phone: " +56 9 1234 5678 ",
      role: " Jefa de equipo ",
      utms: { utm_source: "meta", utm_campaign: "liderazgo-g1" },
    });

    expect(payload.program_interest).toBe("liderazgo");
    expect(payload.source).toBe(LIDERAZGO_LEAD_SOURCE);
    expect(payload.full_name).toBe("Ana Rojas");
    expect(payload.email).toBe("ana@ejemplo.cl");
    expect(payload.phone).toBe("+56 9 1234 5678");
    expect(payload.role).toBe("Jefa de equipo");
    expect(payload.company).toBe("");
    expect(payload.message).toBe("");
    expect(payload.utm_source).toBe("meta");
    expect(payload.utm_campaign).toBe("liderazgo-g1");
    expect(payload.utm_medium).toBe("");
  });

  it("propaga el honeypot para que la API lo descarte", () => {
    const payload = buildLiderazgoLeadPayload({
      full_name: "Bot",
      email: "bot@spam.com",
      phone: "123456",
      website: "http://spam.example",
    });

    expect(payload.website).toBe("http://spam.example");
  });
});

describe("normalizarDesafios", () => {
  it("descarta la etiqueta 'Otro' y guarda el texto que escribió", () => {
    // Guardar la palabra "Otro" no dice nada, y dejarla junto al texto real
    // inflaría un "Otro" que no corresponde a ningún desafío concreto.
    expect(normalizarDesafios(["Motivación", "Otro"], "Rotación de asesores")).toEqual([
      "Motivación",
      "Rotación de asesores",
    ]);
  });

  it("no guarda nada por 'Otro' si marcó la casilla y no escribió", () => {
    expect(normalizarDesafios(["Motivación", "Otro"], "  ")).toEqual(["Motivación"]);
  });

  it("no duplica cuando el texto libre repite una opción ya marcada", () => {
    expect(normalizarDesafios(["Motivación", "Otro"], "Motivación")).toEqual(["Motivación"]);
  });

  it("devuelve un arreglo vacío cuando no marcó nada", () => {
    expect(normalizarDesafios(undefined, undefined)).toEqual([]);
  });
});

describe("buildLiderazgoLeadPayload con las preguntas de calificación", () => {
  it("lleva las respuestas nuevas al payload", () => {
    const p = buildLiderazgoLeadPayload({
      full_name: "Ana Soto",
      email: "ana@ejemplo.cl",
      phone: "+56911111111",
      lidera_equipo: "Sí",
      personas_a_cargo: "4 a 7 personas",
      desafios: ["Motivación"],
    });
    expect(p.lidera_equipo).toBe("Sí");
    expect(p.personas_a_cargo).toBe("4 a 7 personas");
    expect(p.desafios).toEqual(["Motivación"]);
  });

  it("no rompe un lead sin las preguntas nuevas (las otras landings)", () => {
    const p = buildLiderazgoLeadPayload({
      full_name: "Ana Soto",
      email: "ana@ejemplo.cl",
      phone: "+56911111111",
    });
    expect(p.lidera_equipo).toBe("");
    expect(p.desafios).toEqual([]);
  });
});
