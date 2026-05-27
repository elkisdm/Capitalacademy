"use client";

import { useState } from "react";
import type { QuizQuestion } from "./types";
import { CheckCircleIcon, ChevronIcon, LoaderIcon, TrashIcon } from "./icons";

export function QuestionCard({
  question,
  index,
  onSave,
  onDelete,
}: {
  question: QuizQuestion;
  index: number;
  onSave: (q: QuizQuestion) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(question.question_text);
  const [opts, setOpts] = useState<Record<string, string>>({ ...question.options });
  const [correct, setCorrect] = useState(question.correct_option);
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [showExplanation, setShowExplanation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const dirty =
    text !== question.question_text ||
    correct !== question.correct_option ||
    explanation !== (question.explanation ?? "") ||
    JSON.stringify(opts) !== JSON.stringify(question.options);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      ...question,
      question_text: text,
      options: opts,
      correct_option: correct,
      explanation: explanation || null,
    });
    setSaving(false);
    setEditing(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(question.id);
    setDeleting(false);
  };

  return (
    <div className="ca-card overflow-hidden">
      <div className="p-5">
        {/* Header row */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] font-bold text-ca-ink-soft">
              #{String(index + 1).padStart(2, "0")}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                background: question.is_generated
                  ? "rgba(94,23,235,0.10)"
                  : "rgba(20,22,58,0.06)",
                color: question.is_generated
                  ? "var(--color-ca-violet)"
                  : "var(--color-ca-ink-soft)",
              }}
            >
              {question.is_generated ? "IA" : "Manual"}
            </span>
            {question.lessons?.title && (
              <span className="rounded-full bg-ca-bg-soft px-2 py-0.5 text-[10px] font-semibold text-ca-ink-soft">
                {question.lessons.title}
              </span>
            )}
          </div>
          <button
            onClick={() => setEditing(!editing)}
            className="text-[12px] font-bold text-ca-violet hover:underline"
          >
            {editing ? "Cancelar" : "Editar"}
          </button>
        </div>

        {/* Question text */}
        {editing ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[14px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
          />
        ) : (
          <p className="text-[14px] font-semibold leading-relaxed text-ca-ink">{question.question_text}</p>
        )}

        {/* Options */}
        <div className="mt-3 grid gap-2">
          {(["A", "B", "C", "D"] as const).map((key) => {
            const isCorrect = correct === key;
            return (
              <div key={key} className="flex items-center gap-2">
                {editing ? (
                  <button
                    type="button"
                    onClick={() => setCorrect(key)}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors"
                    style={{
                      borderColor: isCorrect ? "var(--color-ca-lime-deep)" : "rgba(20,22,58,0.12)",
                      background: isCorrect ? "rgba(168,211,16,0.18)" : "transparent",
                    }}
                  >
                    {isCorrect && (
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-ca-lime-deep)" }} />
                    )}
                  </button>
                ) : (
                  <div
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                    style={{
                      background: isCorrect ? "rgba(168,211,16,0.22)" : "rgba(20,22,58,0.05)",
                      color: isCorrect ? "#3f5a05" : "var(--color-ca-ink-soft)",
                    }}
                  >
                    {isCorrect ? <CheckCircleIcon /> : key}
                  </div>
                )}
                {editing ? (
                  <input
                    value={opts[key] ?? ""}
                    onChange={(e) => setOpts({ ...opts, [key]: e.target.value })}
                    className="min-w-0 flex-1 rounded-xl border border-ca-ink/[0.08] bg-white px-3 py-2 text-[13px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
                    placeholder={`Opcion ${key}`}
                  />
                ) : (
                  <span
                    className="text-[13px]"
                    style={{
                      color: isCorrect ? "#3f5a05" : "var(--color-ca-ink)",
                      fontWeight: isCorrect ? 700 : 500,
                    }}
                  >
                    <span className="mr-1.5 font-mono text-[11px] font-bold text-ca-ink-soft">{key}.</span>
                    {opts[key]}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Explanation (collapsible) */}
        <div className="mt-3">
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-ca-ink-soft hover:text-ca-ink"
          >
            <ChevronIcon open={showExplanation} />
            Explicacion
          </button>
          {showExplanation && (
            <div className="mt-2">
              {editing ? (
                <textarea
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  rows={2}
                  placeholder="Justificacion de la respuesta correcta..."
                  className="w-full rounded-xl border border-ca-ink/[0.08] bg-white px-4 py-2.5 text-[13px] text-ca-ink outline-none transition-colors focus:border-ca-violet/40"
                />
              ) : (
                <p className="text-[13px] leading-relaxed text-ca-ink-soft">
                  {question.explanation || "Sin explicacion"}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {editing && (
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-ca-ink transition-colors disabled:opacity-40"
              style={{ background: "var(--color-ca-lime)" }}
            >
              {saving ? <LoaderIcon /> : <CheckCircleIcon />}
              Guardar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-red-600/70 transition-colors hover:bg-red-50 disabled:opacity-40"
            >
              {deleting ? <LoaderIcon /> : <TrashIcon />}
              Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
