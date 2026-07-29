import { describe, it, expect } from "vitest";
import {
  formatCLP,
  formatMiles,
  formatUF,
  maskMonto,
  parseMonto,
} from "@/lib/utils/money";

// Intl en es-CL usa punto como separador de miles y NBSP tras el "$".
const norm = (s: string) => s.replace(/ /g, " ");

describe("formatCLP", () => {
  it("formatea con separador de miles y sin decimales", () => {
    expect(norm(formatCLP(1_234_567))).toBe("$1.234.567");
    expect(norm(formatCLP(0))).toBe("$0");
  });

  it("redondea los decimales", () => {
    expect(norm(formatCLP(670_770.42))).toBe("$670.770");
    expect(norm(formatCLP(670_770.62))).toBe("$670.771");
  });

  it("soporta negativos (renta final bajo cero)", () => {
    expect(norm(formatCLP(-300_000))).toContain("300.000");
  });

  it("degrada a $0 ante NaN o Infinity en vez de imprimir basura", () => {
    expect(norm(formatCLP(NaN))).toBe("$0");
    expect(norm(formatCLP(Infinity))).toBe("$0");
  });
});

describe("formatMiles", () => {
  it("agrupa sin símbolo de moneda", () => {
    expect(formatMiles(1_300_000)).toBe("1.300.000");
    expect(formatMiles(0)).toBe("0");
  });

  it("devuelve string vacío ante NaN", () => {
    expect(formatMiles(NaN)).toBe("");
  });
});

describe("formatUF", () => {
  it("agrega el sufijo y admite decimales", () => {
    expect(formatUF(2500)).toBe("2.500 UF");
    expect(formatUF(41_234.56)).toBe("41.234,56 UF");
  });
});

describe("parseMonto", () => {
  it("descarta todo lo que no sea dígito", () => {
    expect(parseMonto("$1.300.000")).toBe(1_300_000);
    expect(parseMonto("1 300 000 pesos")).toBe(1_300_000);
    expect(parseMonto("2.500")).toBe(2500);
  });

  it("devuelve 0 ante entrada vacía o sin dígitos", () => {
    expect(parseMonto("")).toBe(0);
    expect(parseMonto("abc")).toBe(0);
    expect(parseMonto("   ")).toBe(0);
  });
});

describe("maskMonto", () => {
  it("devuelve display formateado y valor limpio", () => {
    expect(maskMonto("1300000")).toEqual({ display: "1.300.000", value: 1_300_000 });
    expect(maskMonto("$1.300.000")).toEqual({ display: "1.300.000", value: 1_300_000 });
  });

  it("deja el campo vacío cuando el usuario borra todo", () => {
    expect(maskMonto("")).toEqual({ display: "", value: 0 });
  });

  it("muestra 0 cuando el usuario escribe explícitamente un cero", () => {
    expect(maskMonto("0")).toEqual({ display: "0", value: 0 });
  });
});
