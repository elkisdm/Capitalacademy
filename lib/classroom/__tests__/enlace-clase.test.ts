import { describe, it, expect } from "vitest";
import { joinHrefFor, isExternalJoinHref } from "@/lib/classroom/enlace-clase";

describe("joinHrefFor", () => {
  it("manda al enlace externo cuando la clase tiene uno cargado", () => {
    // El caso del 26-ago: la clase se dictó por Zoom aunque tenía sala propia.
    expect(
      joinHrefFor({ meeting_url: "https://zoom.us/j/123", code: "klm-yvde-luq" }),
    ).toBe("https://zoom.us/j/123");
  });

  it("usa la sala propia cuando no hay enlace externo", () => {
    expect(joinHrefFor({ meeting_url: null, code: "abc-defg-hij" })).toBe("/sala/abc-defg-hij");
  });

  it("ignora un enlace externo vacío o de puros espacios", () => {
    expect(joinHrefFor({ meeting_url: "", code: "abc-defg-hij" })).toBe("/sala/abc-defg-hij");
    expect(joinHrefFor({ meeting_url: "   ", code: "abc-defg-hij" })).toBe("/sala/abc-defg-hij");
  });

  it("devuelve null cuando no hay por dónde entrar", () => {
    expect(joinHrefFor({ meeting_url: null, code: null })).toBeNull();
    expect(joinHrefFor({})).toBeNull();
  });
});

describe("isExternalJoinHref", () => {
  it("distingue el enlace externo de la sala propia", () => {
    expect(isExternalJoinHref("https://zoom.us/j/123")).toBe(true);
    expect(isExternalJoinHref("/sala/abc-defg-hij")).toBe(false);
    expect(isExternalJoinHref(null)).toBe(false);
  });
});
