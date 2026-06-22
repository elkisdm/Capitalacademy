import { describe, it, expect } from "vitest";
import {
  questionPayloadSchema,
  payloadToDbFields,
} from "@/lib/classroom/quiz-question-schema";

const opts = { A: "uno", B: "dos", C: "tres" };

describe("questionPayloadSchema — single_choice", () => {
  it("acepta una correcta válida y produce correct_option legacy", () => {
    const parsed = questionPayloadSchema.parse({
      questionType: "single_choice",
      questionText: "¿Cuál?",
      options: opts,
      correctAnswer: "B",
    });
    const db = payloadToDbFields(parsed);
    expect(db).toMatchObject({
      question_type: "single_choice",
      correct_answer: "B",
      correct_option: "B",
      options: opts,
    });
  });
  it("rechaza correctAnswer fuera de las opciones", () => {
    const r = questionPayloadSchema.safeParse({
      questionType: "single_choice",
      questionText: "x",
      options: opts,
      correctAnswer: "Z",
    });
    expect(r.success).toBe(false);
  });
  it("rechaza menos de 2 opciones", () => {
    const r = questionPayloadSchema.safeParse({
      questionType: "single_choice",
      questionText: "x",
      options: { A: "sola" },
      correctAnswer: "A",
    });
    expect(r.success).toBe(false);
  });
  it("rechaza opción vacía", () => {
    const r = questionPayloadSchema.safeParse({
      questionType: "single_choice",
      questionText: "x",
      options: { A: "uno", B: "  " },
      correctAnswer: "A",
    });
    expect(r.success).toBe(false);
  });
});

describe("questionPayloadSchema — multiple_choice", () => {
  it("acepta subconjunto válido", () => {
    const parsed = questionPayloadSchema.parse({
      questionType: "multiple_choice",
      questionText: "marca todas",
      options: opts,
      correctAnswer: ["A", "C"],
    });
    const db = payloadToDbFields(parsed);
    expect(db.correct_answer).toEqual(["A", "C"]);
    expect(db.correct_option).toBeNull();
  });
  it("rechaza una correcta inexistente", () => {
    const r = questionPayloadSchema.safeParse({
      questionType: "multiple_choice",
      questionText: "x",
      options: opts,
      correctAnswer: ["A", "Z"],
    });
    expect(r.success).toBe(false);
  });
  it("rechaza duplicados", () => {
    const r = questionPayloadSchema.safeParse({
      questionType: "multiple_choice",
      questionText: "x",
      options: opts,
      correctAnswer: ["A", "A"],
    });
    expect(r.success).toBe(false);
  });
  it("rechaza vacío", () => {
    const r = questionPayloadSchema.safeParse({
      questionType: "multiple_choice",
      questionText: "x",
      options: opts,
      correctAnswer: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("questionPayloadSchema — true_false", () => {
  it("normaliza opciones fijas V/F", () => {
    const parsed = questionPayloadSchema.parse({
      questionType: "true_false",
      questionText: "¿verdad?",
      correctAnswer: "true",
    });
    const db = payloadToDbFields(parsed);
    expect(db.options).toEqual({ true: "Verdadero", false: "Falso" });
    expect(db.correct_answer).toBe("true");
  });
  it("rechaza valor que no es true/false", () => {
    const r = questionPayloadSchema.safeParse({
      questionType: "true_false",
      questionText: "x",
      correctAnswer: "maybe",
    });
    expect(r.success).toBe(false);
  });
});

describe("questionPayloadSchema — short_answer", () => {
  it("acepta lista de respuestas y options vacío", () => {
    const parsed = questionPayloadSchema.parse({
      questionType: "short_answer",
      questionText: "capital de Chile",
      correctAnswer: ["Santiago"],
    });
    const db = payloadToDbFields(parsed);
    expect(db.options).toEqual({});
    expect(db.correct_answer).toEqual(["Santiago"]);
  });
  it("rechaza lista vacía", () => {
    const r = questionPayloadSchema.safeParse({
      questionType: "short_answer",
      questionText: "x",
      correctAnswer: [],
    });
    expect(r.success).toBe(false);
  });
});

describe("questionPayloadSchema — tipo inválido", () => {
  it("rechaza questionType desconocido", () => {
    const r = questionPayloadSchema.safeParse({
      questionType: "essay",
      questionText: "x",
      correctAnswer: "y",
    });
    expect(r.success).toBe(false);
  });
});
