import { describe, expect, it } from "vitest";
import {
  buildLiderazgoLeadPayload,
  LIDERAZGO_LEAD_SOURCE,
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
