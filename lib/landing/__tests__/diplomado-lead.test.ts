import { describe, expect, it } from "vitest";
import {
  buildDiplomadoLeadPayload,
  DIPLOMADO_LEAD_SOURCE,
} from "../diplomado-lead";

describe("buildDiplomadoLeadPayload", () => {
  it("fija programa diplomado y source de la landing, y recorta espacios", () => {
    const payload = buildDiplomadoLeadPayload({
      full_name: "  Ana Rojas ",
      email: " ana@ejemplo.cl ",
      phone: " +56 9 1234 5678 ",
      role: " Asesora ",
      utms: { utm_source: "meta", utm_campaign: "diplomado-g5" },
    });

    expect(payload.program_interest).toBe("diplomado");
    expect(payload.source).toBe(DIPLOMADO_LEAD_SOURCE);
    expect(payload.full_name).toBe("Ana Rojas");
    expect(payload.email).toBe("ana@ejemplo.cl");
    expect(payload.phone).toBe("+56 9 1234 5678");
    expect(payload.role).toBe("Asesora");
    expect(payload.company).toBe("");
    expect(payload.message).toBe("");
    expect(payload.utm_source).toBe("meta");
    expect(payload.utm_campaign).toBe("diplomado-g5");
    expect(payload.utm_medium).toBe("");
  });

  it("propaga el honeypot para que la API descarte el envío", () => {
    const payload = buildDiplomadoLeadPayload({
      full_name: "Bot",
      email: "bot@x.cl",
      phone: "123456",
      website: "http://spam",
    });
    expect(payload.website).toBe("http://spam");
  });

  it("sin honeypot ni utms deja cadenas vacías (la API las vuelve null)", () => {
    const payload = buildDiplomadoLeadPayload({
      full_name: "Ana",
      email: "ana@x.cl",
      phone: "+56912345678",
    });
    expect(payload.website).toBe("");
    expect(payload.utm_term).toBe("");
  });
});
