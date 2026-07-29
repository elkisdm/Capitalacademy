"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import {
  QUESTION_TYPE_LABELS,
  SURVEY_QUESTION_TYPES,
  type SurveyQuestionType,
} from "@/lib/surveys/questions";

/**
 * Borrador editable de una pregunta. Es más laxo que `SurveyQuestion`: mientras
 * se escribe, una pregunta de opción única puede tener una sola alternativa o el
 * título vacío. La validación estricta ocurre al enviar (en la API, con el
 * schema Zod compartido), no en cada tecla.
 */
export type QuestionDraft = {
  key: string;
  type: SurveyQuestionType;
  title: string;
  isRequired: boolean;
  options: string[];
  scaleMin: number;
  scaleMax: number;
};

export function emptyQuestion(index: number): QuestionDraft {
  return {
    key: `p${index + 1}`,
    type: "scale",
    title: "",
    isRequired: true,
    options: ["", ""],
    scaleMin: 1,
    scaleMax: 5,
  };
}

const NEEDS_OPTIONS: SurveyQuestionType[] = ["single_choice", "multiple_choice"];

export function QuestionEditor({
  question,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  question: QuestionDraft;
  index: number;
  total: number;
  onChange: (next: QuestionDraft) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const needsOptions = NEEDS_OPTIONS.includes(question.type);

  return (
    <li className="rounded-2xl border border-ca-ink/[0.10] bg-ca-surface p-4">
      <div className="flex items-start gap-3">
        <span className="mt-2 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ca-ink/5 text-[12px] font-black text-ca-ink-soft">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1 space-y-3">
          <Input
            value={question.title}
            maxLength={500}
            placeholder="Escribe la pregunta"
            onChange={(e) => onChange({ ...question, title: e.target.value })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              aria-label="Tipo de pregunta"
              value={question.type}
              onChange={(e) =>
                onChange({ ...question, type: e.target.value as SurveyQuestionType })
              }
            >
              {SURVEY_QUESTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {QUESTION_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>

            {question.type === "scale" ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  aria-label="Mínimo de la escala"
                  min={0}
                  max={9}
                  value={question.scaleMin}
                  onChange={(e) => onChange({ ...question, scaleMin: Number(e.target.value) })}
                />
                <span className="text-[13px] text-ca-ink-soft">a</span>
                <Input
                  type="number"
                  aria-label="Máximo de la escala"
                  min={1}
                  max={10}
                  value={question.scaleMax}
                  onChange={(e) => onChange({ ...question, scaleMax: Number(e.target.value) })}
                />
              </div>
            ) : (
              question.type !== "section_break" && (
                <label className="flex items-center gap-2 text-[13px] text-ca-ink">
                  <input
                    type="checkbox"
                    checked={question.isRequired}
                    onChange={(e) => onChange({ ...question, isRequired: e.target.checked })}
                    className="h-4 w-4 accent-ca-violet"
                  />
                  Obligatoria
                </label>
              )
            )}
          </div>

          {needsOptions && (
            <div className="space-y-2">
              {question.options.map((option, optionIndex) => (
                <div key={optionIndex} className="flex items-center gap-2">
                  <Input
                    value={option}
                    aria-label={`Alternativa ${optionIndex + 1}`}
                    placeholder={`Alternativa ${optionIndex + 1}`}
                    onChange={(e) => {
                      const options = [...question.options];
                      options[optionIndex] = e.target.value;
                      onChange({ ...question, options });
                    }}
                  />
                  {question.options.length > 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Quitar alternativa ${optionIndex + 1}`}
                      onClick={() =>
                        onChange({
                          ...question,
                          options: question.options.filter((_, i) => i !== optionIndex),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              ))}
              {question.options.length < 20 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ ...question, options: [...question.options, ""] })}
                >
                  + Agregar alternativa
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Subir pregunta"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Bajar pregunta"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown size={14} />
          </Button>
          <Button variant="ghost" size="sm" aria-label="Eliminar pregunta" onClick={onRemove}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
    </li>
  );
}

/** Traduce el borrador de UI al contrato que espera la API (y el motor remoto). */
export function draftToPayload(draft: QuestionDraft) {
  const base = { key: draft.key, title: draft.title.trim() };

  switch (draft.type) {
    case "single_choice":
    case "multiple_choice":
      return {
        ...base,
        type: draft.type,
        isRequired: draft.isRequired,
        options: draft.options
          .map((label) => label.trim())
          .filter(Boolean)
          .map((label, index) => ({ value: `o${index + 1}`, label })),
      };
    case "scale":
      return {
        ...base,
        type: "scale" as const,
        isRequired: draft.isRequired,
        validation: { min: draft.scaleMin, max: draft.scaleMax },
      };
    case "text":
      return { ...base, type: "text" as const, isRequired: draft.isRequired };
    case "nps":
      return { ...base, type: "nps" as const, isRequired: draft.isRequired };
    case "section_break":
      return { ...base, type: "section_break" as const };
  }
}
