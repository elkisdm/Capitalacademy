/**
 * Contrato de pregunta de encuesta.
 *
 * Espeja `SurveyQuestion` de capital-admin
 * (`packages/admin-modules/src/surveys/types.ts`) porque la fila se escribe en
 * SU base y la renderiza SU formulario: si el shape no calza, el formulario
 * público no dibuja la pregunta.
 *
 * Se soporta un SUBCONJUNTO de los 11 tipos del motor remoto — los que la
 * academia realmente usa (la encuesta de feedback del 22-jul son exactamente
 * estos: escala 1-5, opción única, texto abierto). Los tipos no soportados aquí
 * (`file`, `date`, `email`, `phone`, `number`) siguen existiendo en el motor y
 * se pueden crear desde el panel de capital-admin; esta capa no los rompe, solo
 * no los ofrece.
 */

import { z } from "zod";

export const SURVEY_QUESTION_TYPES = [
  "single_choice",
  "multiple_choice",
  "text",
  "scale",
  "nps",
  "section_break",
] as const;

export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  single_choice: "Opción única",
  multiple_choice: "Opción múltiple",
  text: "Respuesta abierta",
  scale: "Escala",
  nps: "NPS (0 a 10)",
  section_break: "Separador de sección",
};

const optionSchema = z.object({
  value: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
});

const baseQuestion = {
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    // La clave viaja como nombre de campo en `survey_answers.question_key` y en
    // el export CSV: se restringe a identificador para que no rompa cabeceras.
    .regex(/^[a-z0-9_]+$/, "La clave solo admite minúsculas, números y guion bajo"),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(1000).nullable().optional(),
  isRequired: z.boolean().optional(),
};

export const surveyQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    ...baseQuestion,
    type: z.literal("single_choice"),
    options: z.array(optionSchema).min(2, "Necesita al menos 2 opciones").max(20),
    allowOther: z.boolean().optional(),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal("multiple_choice"),
    options: z.array(optionSchema).min(2, "Necesita al menos 2 opciones").max(20),
    allowOther: z.boolean().optional(),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal("text"),
    validation: z
      .object({ maxLength: z.number().int().positive().max(5000).optional() })
      .optional(),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal("scale"),
    validation: z
      .object({
        min: z.number().int().min(0).max(10),
        max: z.number().int().min(1).max(10),
      })
      .refine((v) => v.max > v.min, { message: "El máximo debe ser mayor que el mínimo" }),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal("nps"),
  }),
  z.object({
    // Un separador no se responde: no lleva `isRequired` ni clave semántica,
    // pero el motor remoto igual exige `key` única.
    key: baseQuestion.key,
    title: baseQuestion.title,
    description: baseQuestion.description,
    type: z.literal("section_break"),
  }),
]);

export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;

/** Lista completa: claves únicas y al menos una pregunta respondible. */
export const surveyQuestionsSchema = z
  .array(surveyQuestionSchema)
  .min(1, "La encuesta necesita al menos una pregunta")
  .max(50)
  .superRefine((questions, ctx) => {
    const seen = new Set<string>();
    for (const [index, question] of questions.entries()) {
      if (seen.has(question.key)) {
        ctx.addIssue({
          code: "custom",
          message: `La clave "${question.key}" está repetida`,
          path: [index, "key"],
        });
      }
      seen.add(question.key);
    }
    if (questions.every((q) => q.type === "section_break")) {
      ctx.addIssue({
        code: "custom",
        message: "La encuesta necesita al menos una pregunta que se pueda responder",
      });
    }
  });

/**
 * Payload tal como lo espera `surveys.questions` en el motor remoto: cada
 * pregunta con su `sortOrder` explícito (el formulario ordena por ese campo, no
 * por el índice del array).
 */
export function toRemoteQuestions(questions: SurveyQuestion[]): Record<string, unknown>[] {
  return questions.map((question, index) => ({
    ...question,
    isRequired: "isRequired" in question ? (question.isRequired ?? false) : false,
    sortOrder: index,
  }));
}
