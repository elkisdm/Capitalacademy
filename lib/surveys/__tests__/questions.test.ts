import { describe, it, expect } from "vitest";
import {
  surveyQuestionSchema,
  surveyQuestionsSchema,
  toRemoteQuestions,
  type SurveyQuestion,
} from "@/lib/surveys/questions";

const CHOICE = {
  key: "bloque_util",
  type: "single_choice" as const,
  title: "¿Qué bloque te pareció más útil?",
  options: [
    { value: "o1", label: "Fundamentos" },
    { value: "o2", label: "Herramientas" },
  ],
};

const SCALE = {
  key: "utilidad",
  type: "scale" as const,
  title: "¿Qué tan aplicable fue?",
  validation: { min: 1, max: 5 },
};

describe("surveyQuestionSchema", () => {
  it("acepta una pregunta de opción única con dos alternativas", () => {
    expect(surveyQuestionSchema.safeParse(CHOICE).success).toBe(true);
  });

  it("rechaza opción única con menos de dos alternativas", () => {
    const parsed = surveyQuestionSchema.safeParse({ ...CHOICE, options: [CHOICE.options[0]] });
    expect(parsed.success).toBe(false);
  });

  it("acepta escala válida y rechaza max <= min", () => {
    expect(surveyQuestionSchema.safeParse(SCALE).success).toBe(true);
    expect(
      surveyQuestionSchema.safeParse({ ...SCALE, validation: { min: 5, max: 5 } }).success,
    ).toBe(false);
  });

  it("acepta texto abierto y NPS", () => {
    expect(
      surveyQuestionSchema.safeParse({ key: "libre", type: "text", title: "¿Qué mejorarías?" })
        .success,
    ).toBe(true);
    expect(
      surveyQuestionSchema.safeParse({ key: "nps", type: "nps", title: "¿Nos recomendarías?" })
        .success,
    ).toBe(true);
  });

  // La clave viaja como cabecera de CSV y como `survey_answers.question_key`.
  it("rechaza claves que romperían el export", () => {
    for (const key of ["Con Espacio", "acentúada", "guion-medio", ""]) {
      expect(surveyQuestionSchema.safeParse({ ...SCALE, key }).success).toBe(false);
    }
    expect(surveyQuestionSchema.safeParse({ ...SCALE, key: "clave_ok_2" }).success).toBe(true);
  });

  it("rechaza un tipo que el motor remoto no recibiría de aquí", () => {
    expect(surveyQuestionSchema.safeParse({ ...SCALE, type: "file" }).success).toBe(false);
  });
});

describe("surveyQuestionsSchema", () => {
  it("acepta una lista válida", () => {
    expect(surveyQuestionsSchema.safeParse([SCALE, CHOICE]).success).toBe(true);
  });

  it("rechaza la lista vacía", () => {
    expect(surveyQuestionsSchema.safeParse([]).success).toBe(false);
  });

  it("rechaza claves repetidas señalando cuál", () => {
    const parsed = surveyQuestionsSchema.safeParse([SCALE, { ...CHOICE, key: SCALE.key }]);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain("utilidad");
    }
  });

  it("rechaza una encuesta que solo tiene separadores", () => {
    const parsed = surveyQuestionsSchema.safeParse([
      { key: "s1", type: "section_break", title: "Parte 1" },
    ]);
    expect(parsed.success).toBe(false);
  });
});

describe("toRemoteQuestions", () => {
  it("agrega sortOrder según el orden del array", () => {
    const remote = toRemoteQuestions([SCALE, CHOICE] as SurveyQuestion[]);
    expect(remote.map((q) => q.sortOrder)).toEqual([0, 1]);
  });

  it("normaliza isRequired a booleano, incluso en separadores", () => {
    const remote = toRemoteQuestions([
      { key: "s1", type: "section_break", title: "Parte 1" },
      { ...SCALE, isRequired: true },
    ] as SurveyQuestion[]);

    expect(remote[0].isRequired).toBe(false);
    expect(remote[1].isRequired).toBe(true);
  });
});
