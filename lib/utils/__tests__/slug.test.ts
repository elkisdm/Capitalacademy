import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/utils/slug";

describe("slugify", () => {
  it("baja a minúsculas y reemplaza espacios por guiones", () => {
    expect(slugify("Introducción al Liderazgo")).toBe("introduccion-al-liderazgo");
  });

  it("translitera ñ y elimina diacríticos y símbolos", () => {
    expect(slugify("Módulo 1: Niños & Año")).toBe("modulo-1-ninos-ano");
  });

  it("colapsa separadores y recorta guiones de los bordes", () => {
    expect(slugify("  --Hola   Mundo--  ")).toBe("hola-mundo");
  });

  it("devuelve cadena vacía cuando no queda nada slugificable", () => {
    expect(slugify("¿? !!")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("usa el base cuando está libre", () => {
    expect(uniqueSlug("Intro", [])).toBe("intro");
  });

  it("sufija -2, -3… cuando hay colisión", () => {
    expect(uniqueSlug("Intro", ["intro"])).toBe("intro-2");
    expect(uniqueSlug("Intro", ["intro", "intro-2"])).toBe("intro-3");
  });

  it("cae a 'item' cuando el título no produce slug", () => {
    expect(uniqueSlug("¿?", [])).toBe("item");
  });
});
