import { describe, it, expect } from "vitest";
import {
  emptyDraft,
  draftFromQuestion,
  draftToPayload,
  validateDraft,
} from "../question-draft";
import type { QuizQuestion } from "../types";

const baseQ = (over: Partial<QuizQuestion>): QuizQuestion => ({
  id: "q",
  program_id: "p",
  evaluation_id: "e",
  lesson_id: null,
  question_text: "txt",
  options: {},
  question_type: "single_choice",
  correct_answer: null,
  correct_option: null,
  explanation: null,
  is_generated: false,
  sort_order: 0,
  ...over,
});

describe("draftToPayload", () => {
  it("single_choice → options + correctAnswer string", () => {
    const d = {
      ...emptyDraft("single_choice"),
      questionText: "  ¿?  ",
      optionKeys: ["A", "B"],
      options: { A: " uno ", B: "dos" },
      correctSingle: "B",
    };
    expect(draftToPayload(d)).toEqual({
      questionType: "single_choice",
      questionText: "¿?",
      explanation: undefined,
      options: { A: "uno", B: "dos" },
      correctAnswer: "B",
    });
  });

  it("multiple_choice → correctAnswer array", () => {
    const d = {
      ...emptyDraft("multiple_choice"),
      questionText: "x",
      optionKeys: ["A", "B", "C"],
      options: { A: "a", B: "b", C: "c" },
      correctMulti: ["A", "C"],
    };
    expect(draftToPayload(d)).toMatchObject({ correctAnswer: ["A", "C"] });
  });

  it("true_false → correctAnswer string, sin options", () => {
    const d = { ...emptyDraft("true_false"), questionText: "x", correctSingle: "false" };
    const p = draftToPayload(d);
    expect(p).toMatchObject({ questionType: "true_false", correctAnswer: "false" });
    expect(p.options).toBeUndefined();
  });

  it("short_answer → filtra vacíos y recorta", () => {
    const d = {
      ...emptyDraft("short_answer"),
      questionText: "x",
      shortAnswers: [" Santiago ", "", "  "],
    };
    expect(draftToPayload(d)).toMatchObject({ correctAnswer: ["Santiago"] });
  });
});

describe("validateDraft", () => {
  it("exige enunciado", () => {
    expect(validateDraft(emptyDraft())).toMatch(/enunciado/i);
  });
  it("single_choice válido", () => {
    const d = {
      ...emptyDraft("single_choice"),
      questionText: "x",
      optionKeys: ["A", "B"],
      options: { A: "a", B: "b" },
      correctSingle: "A",
    };
    expect(validateDraft(d)).toBeNull();
  });
  it("single_choice rechaza opción vacía", () => {
    const d = {
      ...emptyDraft("single_choice"),
      questionText: "x",
      optionKeys: ["A", "B"],
      options: { A: "a", B: "" },
      correctSingle: "A",
    };
    expect(validateDraft(d)).toMatch(/opciones/i);
  });
  it("multiple_choice exige al menos una correcta", () => {
    const d = {
      ...emptyDraft("multiple_choice"),
      questionText: "x",
      optionKeys: ["A", "B"],
      options: { A: "a", B: "b" },
      correctMulti: [],
    };
    expect(validateDraft(d)).toMatch(/correcta/i);
  });
  it("short_answer exige al menos una respuesta", () => {
    const d = { ...emptyDraft("short_answer"), questionText: "x", shortAnswers: ["", " "] };
    expect(validateDraft(d)).toMatch(/respuesta/i);
  });
});

describe("draftFromQuestion (round-trip)", () => {
  it("reconstruye single_choice desde correct_answer", () => {
    const q = baseQ({
      question_type: "single_choice",
      options: { A: "a", B: "b", C: "c" },
      correct_answer: "C",
    });
    const d = draftFromQuestion(q);
    expect(d.correctSingle).toBe("C");
    expect(d.optionKeys).toEqual(["A", "B", "C"]);
  });

  it("cae a correct_option legacy si correct_answer es null", () => {
    const q = baseQ({
      question_type: "single_choice",
      options: { A: "a", B: "b" },
      correct_answer: null,
      correct_option: "B",
    });
    expect(draftFromQuestion(q).correctSingle).toBe("B");
  });

  it("reconstruye multiple_choice", () => {
    const q = baseQ({
      question_type: "multiple_choice",
      options: { A: "a", B: "b", C: "c" },
      correct_answer: ["A", "C"],
    });
    expect(draftFromQuestion(q).correctMulti).toEqual(["A", "C"]);
  });

  it("reconstruye short_answer", () => {
    const q = baseQ({ question_type: "short_answer", correct_answer: ["Santiago", "stgo"] });
    expect(draftFromQuestion(q).shortAnswers).toEqual(["Santiago", "stgo"]);
  });
});
