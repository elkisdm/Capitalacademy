import { describe, it, expect } from "vitest";
import {
  scoreAnswer,
  normalizeText,
  type ScorableQuestion,
} from "@/lib/classroom/quiz-runtime";

const q = (
  question_type: ScorableQuestion["question_type"],
  correct_answer: unknown,
): ScorableQuestion => ({ id: "q1", question_type, correct_answer });

describe("normalizeText", () => {
  it("recorta, baja a minúsculas y quita tildes", () => {
    expect(normalizeText("  Él  ")).toBe("el");
    expect(normalizeText("ACCIÓN")).toBe("accion");
    expect(normalizeText("Múrcielago")).toBe("murcielago");
  });
});

describe("scoreAnswer — single_choice", () => {
  const question = q("single_choice", "A");
  it("correcta cuando coincide la letra", () => {
    expect(scoreAnswer(question, "A")).toBe(true);
  });
  it("incorrecta cuando no coincide", () => {
    expect(scoreAnswer(question, "B")).toBe(false);
  });
  it("incorrecta cuando no responde", () => {
    expect(scoreAnswer(question, null)).toBe(false);
    expect(scoreAnswer(question, undefined)).toBe(false);
  });
  it("incorrecta si manda un array (tipo equivocado)", () => {
    expect(scoreAnswer(question, ["A"])).toBe(false);
  });
});

describe("scoreAnswer — true_false", () => {
  const question = q("true_false", "true");
  it("correcta cuando coincide", () => {
    expect(scoreAnswer(question, "true")).toBe(true);
  });
  it("incorrecta cuando no coincide", () => {
    expect(scoreAnswer(question, "false")).toBe(false);
  });
});

describe("scoreAnswer — multiple_choice", () => {
  const question = q("multiple_choice", ["A", "C"]);
  it("correcta con el set exacto (orden indiferente)", () => {
    expect(scoreAnswer(question, ["C", "A"])).toBe(true);
  });
  it("incorrecta si falta una", () => {
    expect(scoreAnswer(question, ["A"])).toBe(false);
  });
  it("incorrecta si sobra una", () => {
    expect(scoreAnswer(question, ["A", "C", "D"])).toBe(false);
  });
  it("incorrecta sin respuesta", () => {
    expect(scoreAnswer(question, [])).toBe(false);
    expect(scoreAnswer(question, null)).toBe(false);
  });
  it("sin puntuación parcial: subconjunto no aprueba", () => {
    expect(scoreAnswer(q("multiple_choice", ["A", "B", "C"]), ["A", "B"])).toBe(false);
  });
});

describe("scoreAnswer — short_answer", () => {
  const question = q("short_answer", ["Capital", "capital inicial"]);
  it("correcta por coincidencia normalizada (mayúsculas/espacios)", () => {
    expect(scoreAnswer(question, "  CAPITAL ")).toBe(true);
  });
  it("correcta contra cualquier respuesta aceptada", () => {
    expect(scoreAnswer(question, "Capital Inicial")).toBe(true);
  });
  it("correcta ignorando tildes", () => {
    expect(scoreAnswer(q("short_answer", ["acción"]), "ACCION")).toBe(true);
  });
  it("incorrecta cuando no está en la lista", () => {
    expect(scoreAnswer(question, "deuda")).toBe(false);
  });
  it("incorrecta vacío", () => {
    expect(scoreAnswer(question, "   ")).toBe(false);
  });
});

describe("scoreAnswer — robustez de correct_answer (compat jsonb)", () => {
  it("acepta string suelto para single_choice (correct_option legacy)", () => {
    expect(scoreAnswer(q("single_choice", "B"), "B")).toBe(true);
  });
  it("tipo desconocido nunca aprueba", () => {
    expect(scoreAnswer(q("unknown" as never, "A"), "A")).toBe(false);
  });
});
