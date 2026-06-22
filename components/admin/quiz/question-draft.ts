import type { QuestionType, QuizQuestion } from "./types";

/**
 * Estado editable de una pregunta en el admin, agnóstico del tipo. Centraliza la
 * forma del borrador para que el form de "agregar" y la card de "editar" usen la
 * MISMA lógica de construcción/validación/serialización.
 */

export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: "Opción única",
  multiple_choice: "Opción múltiple",
  true_false: "Verdadero / Falso",
  short_answer: "Respuesta corta",
};

export type QuestionDraft = {
  questionType: QuestionType;
  questionText: string;
  // Opción única / múltiple: N opciones activas (claves A–F).
  optionKeys: string[];
  options: Record<string, string>;
  correctSingle: string; // single_choice → clave; true_false → "true"/"false"
  correctMulti: string[]; // multiple_choice
  shortAnswers: string[]; // short_answer (≥1 texto aceptado)
  explanation: string;
};

export function emptyDraft(questionType: QuestionType = "single_choice"): QuestionDraft {
  return {
    questionType,
    questionText: "",
    optionKeys: ["A", "B", "C", "D"],
    options: { A: "", B: "", C: "", D: "" },
    correctSingle: questionType === "true_false" ? "true" : "A",
    correctMulti: [],
    shortAnswers: [""],
    explanation: "",
  };
}

export function draftFromQuestion(q: QuizQuestion): QuestionDraft {
  const base = emptyDraft(q.question_type);
  const keys = Object.keys(q.options ?? {}).filter((k) => OPTION_LETTERS.includes(k as never));
  const ca = q.correct_answer;

  switch (q.question_type) {
    case "single_choice":
      return {
        ...base,
        questionText: q.question_text,
        optionKeys: keys.length ? keys : base.optionKeys,
        options: { ...base.options, ...q.options },
        correctSingle: (typeof ca === "string" ? ca : q.correct_option) ?? "A",
        explanation: q.explanation ?? "",
      };
    case "multiple_choice":
      return {
        ...base,
        questionText: q.question_text,
        optionKeys: keys.length ? keys : base.optionKeys,
        options: { ...base.options, ...q.options },
        correctMulti: Array.isArray(ca) ? ca : [],
        explanation: q.explanation ?? "",
      };
    case "true_false":
      return {
        ...base,
        questionText: q.question_text,
        correctSingle: typeof ca === "string" ? ca : "true",
        explanation: q.explanation ?? "",
      };
    case "short_answer":
      return {
        ...base,
        questionText: q.question_text,
        shortAnswers: Array.isArray(ca) && ca.length ? ca : [""],
        explanation: q.explanation ?? "",
      };
    default:
      return base;
  }
}

/** Construye el payload que espera la API (POST/PATCH /api/admin/quiz-questions). */
export function draftToPayload(draft: QuestionDraft): Record<string, unknown> {
  const common = {
    questionType: draft.questionType,
    questionText: draft.questionText.trim(),
    explanation: draft.explanation.trim() || undefined,
  };
  switch (draft.questionType) {
    case "single_choice":
      return {
        ...common,
        options: activeOptions(draft),
        correctAnswer: draft.correctSingle,
      };
    case "multiple_choice":
      return {
        ...common,
        options: activeOptions(draft),
        correctAnswer: draft.correctMulti,
      };
    case "true_false":
      return { ...common, correctAnswer: draft.correctSingle };
    case "short_answer":
      return {
        ...common,
        correctAnswer: draft.shortAnswers.map((s) => s.trim()).filter(Boolean),
      };
    default:
      return common;
  }
}

function activeOptions(draft: QuestionDraft): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of draft.optionKeys) out[k] = (draft.options[k] ?? "").trim();
  return out;
}

/** Validación de UX en cliente (espeja el zod del servidor). Devuelve el primer
 *  error o `null` si el borrador es válido para enviar. */
export function validateDraft(draft: QuestionDraft): string | null {
  if (!draft.questionText.trim()) return "Escribe el enunciado de la pregunta";

  switch (draft.questionType) {
    case "single_choice":
    case "multiple_choice": {
      const opts = activeOptions(draft);
      const keys = Object.keys(opts);
      if (keys.length < MIN_OPTIONS) return `Agrega al menos ${MIN_OPTIONS} opciones`;
      if (keys.some((k) => !opts[k])) return "Completa el texto de todas las opciones";
      if (draft.questionType === "single_choice") {
        if (!keys.includes(draft.correctSingle)) return "Marca la respuesta correcta";
      } else {
        if (draft.correctMulti.length < 1) return "Marca al menos una respuesta correcta";
        if (draft.correctMulti.some((k) => !keys.includes(k)))
          return "Una respuesta marcada ya no existe entre las opciones";
      }
      return null;
    }
    case "true_false":
      return draft.correctSingle === "true" || draft.correctSingle === "false"
        ? null
        : "Selecciona Verdadero o Falso";
    case "short_answer":
      return draft.shortAnswers.some((s) => s.trim())
        ? null
        : "Agrega al menos una respuesta aceptada";
    default:
      return "Tipo de pregunta inválido";
  }
}
