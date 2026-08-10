import { describe, it, expect } from "vitest";
import { cleanPhone, formatPhone } from "../phone";

/**
 * `formatPhone` es deliberadamente TOLERANTE: normaliza el móvil chileno y ante
 * cualquier otra cosa devuelve algo razonable sin romper lo que escribió la
 * persona. Los casos que importan son justamente los que NO calzan el patrón.
 */

describe("cleanPhone", () => {
  it("deja solo los dígitos", () => {
    expect(cleanPhone("+56 9 8775-9467")).toBe("56987759467");
  });

  it("devuelve vacío cuando no hay ningún dígito", () => {
    expect(cleanPhone("sin número")).toBe("");
  });
});

describe("formatPhone", () => {
  it("formatea el móvil de 9 dígitos", () => {
    expect(formatPhone("987759467")).toBe("+56 9 8775 9467");
  });

  it("es idempotente sobre un número ya formateado", () => {
    expect(formatPhone("+56 9 8775 9467")).toBe("+56 9 8775 9467");
  });

  it("saca el prefijo de país cuando viene pegado", () => {
    expect(formatPhone("56987759467")).toBe("+56 9 8775 9467");
  });

  it("antepone el 9 a los 8 dígitos sueltos", () => {
    expect(formatPhone("87759467")).toBe("+56 9 8775 9467");
  });

  it("devuelve vacío cuando no viene nada", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("   ")).toBe("");
  });

  it("respeta un internacional que ya trae +", () => {
    // No es chileno: no se toca, porque adivinar sería peor que mostrarlo tal cual.
    expect(formatPhone("+1 415 555 0123")).toBe("+1 415 555 0123");
  });

  it("antepone + a un largo que no reconoce", () => {
    expect(formatPhone("123456")).toBe("+123456");
  });

  it("devuelve la entrada intacta cuando no tiene un solo dígito", () => {
    expect(formatPhone("no aplica")).toBe("no aplica");
  });

  it("no confunde un fijo de 9 dígitos con un móvil", () => {
    // Nueve dígitos pero sin empezar en 9: cae al camino tolerante.
    expect(formatPhone("221234567")).toBe("+221234567");
  });
});
