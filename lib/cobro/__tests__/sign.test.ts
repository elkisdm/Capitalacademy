import { describe, it, expect } from "vitest";
import {
  signCobro,
  verifyCobro,
  signCobroAmount,
  verifyCobroAmount,
  normalizeConcepto,
  MAX_CONCEPTO_LEN,
} from "@/lib/cobro/sign";

const SECRET = "test-secret-key-for-cobro-signing-32chars";

describe("signCobro / verifyCobro", () => {
  it("generates a 64-char hex signature", () => {
    const sig = signCobro(200000, null, SECRET);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies a correct signature", () => {
    const sig = signCobro(200000, "Cuota mensual", SECRET);
    expect(verifyCobro(200000, "Cuota mensual", sig, SECRET)).toBe(true);
  });

  it("rejects when amount is tampered", () => {
    const sig = signCobro(200000, null, SECRET);
    expect(verifyCobro(100000, null, sig, SECRET)).toBe(false);
  });

  it("rejects when concepto is tampered", () => {
    const sig = signCobro(200000, "Original", SECRET);
    expect(verifyCobro(200000, "Tampered", sig, SECRET)).toBe(false);
  });

  it("rejects a malformed signature (not 64 hex chars)", () => {
    expect(verifyCobro(200000, null, "not-a-valid-sig", SECRET)).toBe(false);
    expect(verifyCobro(200000, null, "", SECRET)).toBe(false);
    expect(verifyCobro(200000, null, "abc", SECRET)).toBe(false);
  });

  it("rejects negative or zero amounts", () => {
    const sig = signCobro(0, null, SECRET);
    expect(verifyCobro(0, null, sig, SECRET)).toBe(false);
    const sigNeg = signCobro(-100, null, SECRET);
    expect(verifyCobro(-100, null, sigNeg, SECRET)).toBe(false);
  });

  it("rejects non-integer amounts", () => {
    expect(verifyCobro(200000.5, null, "a".repeat(64), SECRET)).toBe(false);
  });

  it("is backwards-compatible: sign without concepto matches signCobroAmount", () => {
    const sig1 = signCobro(150000, null, SECRET);
    const sig2 = signCobroAmount(150000, SECRET);
    expect(sig1).toBe(sig2);
  });

  it("treats empty concepto same as null (compat)", () => {
    const sig = signCobro(150000, null, SECRET);
    expect(verifyCobro(150000, "", sig, SECRET)).toBe(true);
    expect(verifyCobroAmount(150000, sig, SECRET)).toBe(true);
  });

  it("trims and truncates concepto via normalizeConcepto", () => {
    const longConcepto = "a".repeat(MAX_CONCEPTO_LEN + 10);
    const sig = signCobro(200000, longConcepto, SECRET);
    expect(verifyCobro(200000, longConcepto, sig, SECRET)).toBe(true);
    // Extra chars beyond MAX_CONCEPTO_LEN don't change the signature
    const longerConcepto = "a".repeat(MAX_CONCEPTO_LEN + 50);
    expect(verifyCobro(200000, longerConcepto, sig, SECRET)).toBe(true);
  });

  it("rejects a valid sig used with wrong secret", () => {
    const sig = signCobro(200000, null, SECRET);
    expect(verifyCobro(200000, null, sig, "wrong-secret")).toBe(false);
  });
});

describe("normalizeConcepto", () => {
  it("trims whitespace", () => {
    expect(normalizeConcepto("  hola  ")).toBe("hola");
  });

  it("truncates at MAX_CONCEPTO_LEN", () => {
    const input = "x".repeat(100);
    expect(normalizeConcepto(input)).toHaveLength(MAX_CONCEPTO_LEN);
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeConcepto(null)).toBe("");
    expect(normalizeConcepto(undefined)).toBe("");
  });
});
