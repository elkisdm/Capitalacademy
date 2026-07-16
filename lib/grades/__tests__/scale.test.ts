import { describe, it, expect } from "vitest";
import { pctToGrade, gradeToPct, formatGrade, isPassing, averageGrade } from "@/lib/grades/scale";

describe("pctToGrade — CANDADO (brief §0.2 / corrección A5)", () => {
  it("90% → 6.3 con exigencia 60 (default)", () => {
    expect(pctToGrade(90)).toBe(6.3);
  });

  it("80% → 5.5 con exigencia 60 (default)", () => {
    expect(pctToGrade(80)).toBe(5.5);
  });

  it("60% (la exigencia) → 4.0", () => {
    expect(pctToGrade(60)).toBe(4.0);
  });

  it("0% → 1.0, 100% → 7.0", () => {
    expect(pctToGrade(0)).toBe(1.0);
    expect(pctToGrade(100)).toBe(7.0);
  });

  it("clampa porcentajes fuera de rango", () => {
    expect(pctToGrade(-10)).toBe(1.0);
    expect(pctToGrade(150)).toBe(7.0);
  });

  it("respeta una exigencia distinta de 60", () => {
    // exigencia 70 (ej. passing_grade_pct de un quiz): 70% → 4.0
    expect(pctToGrade(70, 70)).toBe(4.0);
  });
});

describe("gradeToPct", () => {
  it("es inversa de pctToGrade en los puntos clave", () => {
    expect(gradeToPct(4.0)).toBe(60);
    expect(gradeToPct(1.0)).toBe(0);
    expect(gradeToPct(7.0)).toBe(100);
  });
});

describe("formatGrade", () => {
  it("usa coma decimal (es-CL)", () => {
    expect(formatGrade(6.3)).toBe("6,3");
    expect(formatGrade(4)).toBe("4,0");
  });

  it("null/undefined → guion", () => {
    expect(formatGrade(null)).toBe("—");
    expect(formatGrade(undefined)).toBe("—");
  });
});

describe("isPassing", () => {
  it("aprueba con 4.0 o más (default)", () => {
    expect(isPassing(4.0)).toBe(true);
    expect(isPassing(3.9)).toBe(false);
  });

  it("respeta un mínimo distinto", () => {
    expect(isPassing(5.0, 5.0)).toBe(true);
    expect(isPassing(4.9, 5.0)).toBe(false);
  });
});

describe("averageGrade", () => {
  it("promedia simple, sin ponderar", () => {
    expect(averageGrade([6.0, 4.0])).toBe(5.0);
    expect(averageGrade([7.0, 6.0, 5.0])).toBe(6.0);
  });

  it("array vacío → null", () => {
    expect(averageGrade([])).toBeNull();
  });
});
