import { describe, it, expect } from "vitest";
import {
  formatLeadDate,
  formatLeadDateFull,
  formatLeadOrigin,
  isNewLead,
  leadInitials,
  phoneDigits,
} from "../leads-format";

describe("formatLeadDate", () => {
  it("muestra la fecha en hora de Chile (UTC-4 en agosto)", () => {
    // 21-08-2026 19:31 UTC = 15:31 en Chile (invierno, UTC-4).
    expect(formatLeadDate("2026-08-21T19:31:46Z")).toBe("21 ago, 15:31");
  });

  it("no revienta con una fecha inválida", () => {
    expect(formatLeadDate("no-es-fecha")).toBe("");
    expect(formatLeadDateFull("no-es-fecha")).toBe("");
  });
});

describe("formatLeadDateFull", () => {
  it("incluye día de semana, fecha completa y hora de Chile", () => {
    const out = formatLeadDateFull("2026-08-21T19:31:46Z");
    expect(out).toContain("viernes");
    expect(out).toContain("21 de agosto de 2026");
    expect(out).toContain("15:31");
  });
});

describe("formatLeadOrigin", () => {
  it("prefiere la campaña con su fuente", () => {
    expect(
      formatLeadOrigin({
        source: "landing-liderazgo",
        utm_source: "ig",
        utm_campaign: "Programa Liderazgo",
      }),
    ).toBe("Programa Liderazgo (ig)");
  });

  it("cae a la fuente utm y luego al source interno", () => {
    expect(
      formatLeadOrigin({ source: "landing", utm_source: "chatgpt.com", utm_campaign: null }),
    ).toBe("chatgpt.com");
    expect(
      formatLeadOrigin({ source: "calculadora-credito", utm_source: null, utm_campaign: null }),
    ).toBe("calculadora-credito");
    expect(formatLeadOrigin({ source: null, utm_source: null, utm_campaign: null })).toBe(
      "directo",
    );
  });
});

describe("leadInitials", () => {
  it("toma las dos primeras iniciales", () => {
    expect(leadInitials("Karime Bailey")).toBe("KB");
    expect(leadInitials("Juan Andrés De Ferari")).toBe("JA");
  });

  it("tolera un solo nombre y espacios repetidos", () => {
    expect(leadInitials("Limay")).toBe("L");
    expect(leadInitials("  david   parra ")).toBe("DP");
  });
});

describe("isNewLead", () => {
  const now = new Date("2026-08-24T12:00:00Z");

  it("marca como nuevo dentro de las 48 horas", () => {
    expect(isNewLead("2026-08-23T13:00:00Z", now)).toBe(true);
    expect(isNewLead("2026-08-21T12:00:00Z", now)).toBe(false);
  });

  it("una fecha inválida nunca es nueva", () => {
    expect(isNewLead("no-es-fecha", now)).toBe(false);
  });
});

describe("phoneDigits", () => {
  it("deja solo dígitos para el enlace de WhatsApp", () => {
    expect(phoneDigits("+56 9 9132 0220")).toBe("56991320220");
    expect(phoneDigits("+56947087669")).toBe("56947087669");
  });
});
