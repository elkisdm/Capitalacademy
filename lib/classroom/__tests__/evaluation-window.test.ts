import { describe, it, expect } from "vitest";
import { getEvaluationState, isEvaluationOpen } from "@/lib/classroom/evaluation-window";

const NOW = new Date("2026-07-15T12:00:00Z");

describe("getEvaluationState", () => {
  it("is_active=false → draft, sin importar la ventana", () => {
    expect(getEvaluationState({ is_active: false }, NOW)).toBe("draft");
    expect(
      getEvaluationState(
        { is_active: false, opens_at: "2026-01-01T00:00:00Z", closes_at: "2099-01-01T00:00:00Z" },
        NOW,
      ),
    ).toBe("draft");
  });

  it("is_active=true sin ventana (NULL/NULL) → open (comportamiento actual)", () => {
    expect(getEvaluationState({ is_active: true, opens_at: null, closes_at: null }, NOW)).toBe(
      "open",
    );
  });

  it("is_active=true sin ventana (campos ausentes/undefined) → open", () => {
    // Fixtures de tests legados pueden no traer estas claves (undefined, no null).
    expect(getEvaluationState({ is_active: true }, NOW)).toBe("open");
  });

  it("antes de opens_at → scheduled", () => {
    expect(
      getEvaluationState({ is_active: true, opens_at: "2026-07-16T09:30:00Z", closes_at: null }, NOW),
    ).toBe("scheduled");
  });

  it("exactamente en opens_at → open (borde inclusivo)", () => {
    expect(
      getEvaluationState(
        { is_active: true, opens_at: "2026-07-15T12:00:00Z", closes_at: null },
        NOW,
      ),
    ).toBe("open");
  });

  it("después de closes_at → closed", () => {
    expect(
      getEvaluationState({ is_active: true, opens_at: null, closes_at: "2026-07-14T09:30:00Z" }, NOW),
    ).toBe("closed");
  });

  it("exactamente en closes_at → open (borde inclusivo)", () => {
    expect(
      getEvaluationState(
        { is_active: true, opens_at: null, closes_at: "2026-07-15T12:00:00Z" },
        NOW,
      ),
    ).toBe("open");
  });

  it("dentro de la ventana (opens_at < now < closes_at) → open", () => {
    expect(
      getEvaluationState(
        {
          is_active: true,
          opens_at: "2026-07-15T09:30:00Z",
          closes_at: "2026-07-20T00:00:00Z",
        },
        NOW,
      ),
    ).toBe("open");
  });
});

describe("isEvaluationOpen", () => {
  it("true solo cuando el estado es open", () => {
    expect(isEvaluationOpen({ is_active: true, opens_at: null, closes_at: null }, NOW)).toBe(true);
    expect(isEvaluationOpen({ is_active: false }, NOW)).toBe(false);
    expect(
      isEvaluationOpen({ is_active: true, opens_at: "2099-01-01T00:00:00Z", closes_at: null }, NOW),
    ).toBe(false);
    expect(
      isEvaluationOpen({ is_active: true, opens_at: null, closes_at: "2020-01-01T00:00:00Z" }, NOW),
    ).toBe(false);
  });
});
