import { describe, it, expect } from "vitest";
import { getInitials } from "../initials";

describe("getInitials", () => {
  it("toma la inicial de las dos primeras palabras", () => {
    expect(getInitials("Ana Pérez")).toBe("AP");
  });

  it("ignora los apellidos del tercero en adelante", () => {
    expect(getInitials("Rosicela del Valle Fernández")).toBe("RD");
  });

  it("devuelve una sola letra con un nombre de una palabra", () => {
    expect(getInitials("Paola")).toBe("P");
  });

  it("no se cae con espacios de más", () => {
    // `filter(Boolean)` saca las cadenas vacías que deja un split con espacios
    // dobles o con espacio inicial; sin él, `w[0]` sería undefined y reventaría.
    expect(getInitials("  Ana   Pérez ")).toBe("AP");
  });

  it("devuelve vacío con una cadena vacía", () => {
    expect(getInitials("")).toBe("");
    expect(getInitials("   ")).toBe("");
  });

  it("pasa a mayúscula lo que venía en minúscula", () => {
    expect(getInitials("ana pérez")).toBe("AP");
  });
});
