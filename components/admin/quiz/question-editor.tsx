"use client";

import type { QuestionType } from "./types";
import {
  type QuestionDraft,
  OPTION_LETTERS,
  MAX_OPTIONS,
  MIN_OPTIONS,
  QUESTION_TYPE_LABELS,
} from "./question-draft";
import { PlusIcon, TrashIcon } from "./icons";

const TYPES: QuestionType[] = ["single_choice", "multiple_choice", "true_false", "short_answer"];

export function QuestionEditor({
  draft,
  onChange,
  allowTypeChange = true,
}: {
  draft: QuestionDraft;
  onChange: (next: QuestionDraft) => void;
  allowTypeChange?: boolean;
}) {
  const set = (patch: Partial<QuestionDraft>) => onChange({ ...draft, ...patch });

  const setOption = (key: string, value: string) =>
    set({ options: { ...draft.options, [key]: value } });

  const addOption = () => {
    if (draft.optionKeys.length >= MAX_OPTIONS) return;
    const next = OPTION_LETTERS[draft.optionKeys.length];
    set({ optionKeys: [...draft.optionKeys, next], options: { ...draft.options, [next]: "" } });
  };

  const removeOption = (key: string) => {
    if (draft.optionKeys.length <= MIN_OPTIONS) return;
    const optionKeys = draft.optionKeys.filter((k) => k !== key);
    const options = { ...draft.options };
    delete options[key];
    set({
      optionKeys,
      options,
      correctSingle: draft.correctSingle === key ? "" : draft.correctSingle,
      correctMulti: draft.correctMulti.filter((k) => k !== key),
    });
  };

  const toggleMulti = (key: string) =>
    set({
      correctMulti: draft.correctMulti.includes(key)
        ? draft.correctMulti.filter((k) => k !== key)
        : [...draft.correctMulti, key],
    });

  const setShort = (i: number, value: string) => {
    const shortAnswers = [...draft.shortAnswers];
    shortAnswers[i] = value;
    set({ shortAnswers });
  };

  return (
    <div className="space-y-4">
      {/* Tipo */}
      {allowTypeChange && (
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
            Tipo de pregunta
          </label>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => {
              const active = draft.questionType === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ ...draft, questionType: t })}
                  className="rounded-xl border px-3 py-1.5 text-[12px] font-bold transition-colors"
                  style={{
                    borderColor: active ? "var(--color-ca-violet)" : "rgba(20,22,58,0.10)",
                    background: active ? "rgba(94,23,235,0.08)" : "transparent",
                    color: active ? "var(--color-ca-violet)" : "var(--color-ca-ink-soft)",
                  }}
                >
                  {QUESTION_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Enunciado */}
      <div>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
          Pregunta
        </label>
        <textarea
          value={draft.questionText}
          onChange={(e) => set({ questionText: e.target.value })}
          rows={2}
          placeholder="Escribe la pregunta..."
          className="w-full rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
        />
      </div>

      {/* Cuerpo por tipo */}
      {(draft.questionType === "single_choice" || draft.questionType === "multiple_choice") && (
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
            Opciones
          </label>
          <div className="grid gap-2">
            {draft.optionKeys.map((key) => {
              const isCorrect =
                draft.questionType === "single_choice"
                  ? draft.correctSingle === key
                  : draft.correctMulti.includes(key);
              return (
                <div key={key} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      draft.questionType === "single_choice"
                        ? set({ correctSingle: key })
                        : toggleMulti(key)
                    }
                    aria-label={`Marcar ${key} como correcta`}
                    className="grid h-7 w-7 shrink-0 place-items-center border-2 text-[11px] font-bold transition-colors"
                    style={{
                      borderRadius: draft.questionType === "multiple_choice" ? "0.4rem" : "9999px",
                      borderColor: isCorrect ? "var(--color-ca-lime-deep)" : "rgba(20,22,58,0.12)",
                      background: isCorrect ? "rgba(168,211,16,0.18)" : "transparent",
                      color: isCorrect ? "#3f5a05" : "var(--color-ca-ink-soft)",
                    }}
                  >
                    {isCorrect ? (
                      <div
                        className="h-2.5 w-2.5"
                        style={{
                          borderRadius: draft.questionType === "multiple_choice" ? "2px" : "9999px",
                          background: "var(--color-ca-lime-deep)",
                        }}
                      />
                    ) : (
                      key
                    )}
                  </button>
                  <input
                    value={draft.options[key] ?? ""}
                    onChange={(e) => setOption(key, e.target.value)}
                    placeholder={`Opción ${key}`}
                    className="min-w-0 flex-1 rounded-xl border border-ca-ink/[0.08] bg-white px-3 py-2 text-[13px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
                  />
                  {draft.optionKeys.length > MIN_OPTIONS && (
                    <button
                      type="button"
                      onClick={() => removeOption(key)}
                      aria-label={`Eliminar opción ${key}`}
                      className="shrink-0 rounded-lg p-1.5 text-ca-ink-soft transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[11px] text-ca-ink-soft">
              {draft.questionType === "single_choice"
                ? "Marca el círculo de la respuesta correcta"
                : "Marca todas las respuestas correctas"}
            </p>
            {draft.optionKeys.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={addOption}
                className="flex items-center gap-1 text-[12px] font-bold text-ca-violet hover:underline"
              >
                <PlusIcon />
                Agregar opción
              </button>
            )}
          </div>
        </div>
      )}

      {draft.questionType === "true_false" && (
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
            Respuesta correcta
          </label>
          <div className="flex gap-2">
            {(["true", "false"] as const).map((val) => {
              const active = draft.correctSingle === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => set({ correctSingle: val })}
                  className="flex-1 rounded-xl border-2 px-4 py-2.5 text-[13px] font-bold transition-colors"
                  style={{
                    borderColor: active ? "var(--color-ca-lime-deep)" : "rgba(20,22,58,0.12)",
                    background: active ? "rgba(168,211,16,0.18)" : "transparent",
                    color: active ? "#3f5a05" : "var(--color-ca-ink-soft)",
                  }}
                >
                  {val === "true" ? "Verdadero" : "Falso"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {draft.questionType === "short_answer" && (
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
            Respuestas aceptadas
          </label>
          <div className="grid gap-2">
            {draft.shortAnswers.map((ans, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={ans}
                  onChange={(e) => setShort(i, e.target.value)}
                  placeholder={i === 0 ? "Respuesta correcta" : "Sinónimo / variante aceptada"}
                  className="min-w-0 flex-1 rounded-xl border border-ca-ink/[0.08] bg-white px-3 py-2 text-[13px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
                />
                {draft.shortAnswers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => set({ shortAnswers: draft.shortAnswers.filter((_, j) => j !== i) })}
                    aria-label="Eliminar respuesta"
                    className="shrink-0 rounded-lg p-1.5 text-ca-ink-soft transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => set({ shortAnswers: [...draft.shortAnswers, ""] })}
            className="mt-2 flex items-center gap-1 text-[12px] font-bold text-ca-violet hover:underline"
          >
            <PlusIcon />
            Agregar variante aceptada
          </button>
          <p className="mt-1.5 text-[11px] text-ca-ink-soft">
            Se corrige por coincidencia exacta ignorando mayúsculas, espacios y tildes.
          </p>
        </div>
      )}

      {/* Explicación */}
      <div>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
          Explicación (opcional)
        </label>
        <textarea
          value={draft.explanation}
          onChange={(e) => set({ explanation: e.target.value })}
          rows={2}
          placeholder="Por qué esta es la respuesta correcta..."
          className="w-full rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[13px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
        />
      </div>
    </div>
  );
}
