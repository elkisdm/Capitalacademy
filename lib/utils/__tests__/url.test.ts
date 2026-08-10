import { describe, it, expect } from "vitest";
import { normalizeUrl } from "../url";

describe("normalizeUrl", () => {
  it("agrega https:// cuando falta el protocolo", () => {
    expect(normalizeUrl("linkedin.com/in/foo")).toBe("https://linkedin.com/in/foo");
    expect(normalizeUrl("www.linkedin.com/in/foo")).toBe("https://www.linkedin.com/in/foo");
  });

  it("respeta la URL que ya trae protocolo", () => {
    expect(normalizeUrl("https://linkedin.com/in/foo")).toBe("https://linkedin.com/in/foo");
    expect(normalizeUrl("http://sitio.cl")).toBe("http://sitio.cl");
  });

  it("reconoce el protocolo sin importar mayúsculas", () => {
    expect(normalizeUrl("HTTPS://sitio.cl")).toBe("HTTPS://sitio.cl");
  });

  it("recorta los espacios antes de decidir", () => {
    expect(normalizeUrl("  sitio.cl  ")).toBe("https://sitio.cl");
  });

  it("devuelve vacío cuando no viene nada", () => {
    expect(normalizeUrl("")).toBe("");
    expect(normalizeUrl("   ")).toBe("");
  });
});
