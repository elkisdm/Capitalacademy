import { z } from "zod";
import type { QuestionType } from "@/lib/classroom/quiz-runtime";

/**
 * Validación compartida del payload de una pregunta de quiz, por tipo.
 * Centraliza las reglas para que la API admin (crear/editar) y los tests
 * usen la MISMA verdad. Devuelve, ya normalizados, los campos de BD:
 * `question_type`, `options`, `correct_answer` y `correct_option` (legacy).
 *
 * Formas de `correct_answer` (jsonb) según tipo:
 *   single_choice / true_false → "A"            (una clave de options)
 *   multiple_choice            → ["A","C"]      (subconjunto de claves, ≥1)
 *   short_answer               → ["resp", "..."] (≥1 texto aceptado)
 */

const optionsSchema = z
  .record(z.string().regex(/^[A-F]$/, "Clave de opción inválida (A–F)"), z.string().trim().min(1))
  .refine((o) => Object.keys(o).length >= 2 && Object.keys(o).length <= 6, {
    message: "Una pregunta de opciones requiere entre 2 y 6 opciones",
  });

const baseFields = {
  questionText: z.string().trim().min(1, "La pregunta es requerida").max(2000),
  explanation: z.string().trim().max(2000).optional(),
};

export const questionPayloadSchema = z.discriminatedUnion("questionType", [
  // Opción única: N opciones (2–6), una sola correcta.
  z
    .object({
      questionType: z.literal("single_choice"),
      options: optionsSchema,
      correctAnswer: z.string().regex(/^[A-F]$/),
      ...baseFields,
    })
    .superRefine((v, ctx) => {
      if (!(v.correctAnswer in v.options)) {
        ctx.addIssue({ code: "custom", message: "La respuesta correcta no está entre las opciones", path: ["correctAnswer"] });
      }
    }),
  // Opción múltiple: N opciones (2–6), ≥1 correctas; el set debe ser subconjunto.
  z
    .object({
      questionType: z.literal("multiple_choice"),
      options: optionsSchema,
      correctAnswer: z.array(z.string().regex(/^[A-F]$/)).min(1, "Marca al menos una respuesta correcta"),
      ...baseFields,
    })
    .superRefine((v, ctx) => {
      const keys = new Set(Object.keys(v.options));
      const unique = new Set(v.correctAnswer);
      if (unique.size !== v.correctAnswer.length) {
        ctx.addIssue({ code: "custom", message: "Respuestas correctas duplicadas", path: ["correctAnswer"] });
      }
      for (const k of v.correctAnswer) {
        if (!keys.has(k)) {
          ctx.addIssue({ code: "custom", message: `La opción ${k} no existe`, path: ["correctAnswer"] });
        }
      }
    }),
  // Verdadero/Falso: opciones fijas, una correcta.
  z.object({
    questionType: z.literal("true_false"),
    correctAnswer: z.enum(["true", "false"]),
    ...baseFields,
  }),
  // Respuesta corta: lista de respuestas aceptadas (texto).
  z.object({
    questionType: z.literal("short_answer"),
    correctAnswer: z
      .array(z.string().trim().min(1))
      .min(1, "Agrega al menos una respuesta aceptada")
      .max(20),
    ...baseFields,
  }),
]);

export type QuestionPayload = z.infer<typeof questionPayloadSchema>;

const TRUE_FALSE_OPTIONS = { true: "Verdadero", false: "Falso" } as const;

export type QuestionDbFields = {
  question_type: QuestionType;
  options: Record<string, string>;
  correct_answer: string | string[];
  correct_option: string | null;
};

/** Convierte un payload ya validado a los campos de BD de `quiz_questions`. */
export function payloadToDbFields(payload: QuestionPayload): QuestionDbFields {
  switch (payload.questionType) {
    case "single_choice":
      return {
        question_type: "single_choice",
        options: payload.options,
        correct_answer: payload.correctAnswer,
        correct_option: payload.correctAnswer, // legacy compat
      };
    case "multiple_choice":
      return {
        question_type: "multiple_choice",
        options: payload.options,
        correct_answer: payload.correctAnswer,
        correct_option: null,
      };
    case "true_false":
      return {
        question_type: "true_false",
        options: { ...TRUE_FALSE_OPTIONS },
        correct_answer: payload.correctAnswer,
        correct_option: null,
      };
    case "short_answer":
      return {
        question_type: "short_answer",
        options: {},
        correct_answer: payload.correctAnswer,
        correct_option: null,
      };
  }
}
