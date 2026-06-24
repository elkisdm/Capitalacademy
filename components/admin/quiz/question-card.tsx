"use client";

import { useState } from "react";
import type { QuizQuestion } from "./types";
import { CheckCircleIcon, ChevronIcon, LoaderIcon, TrashIcon } from "./icons";
import { QuestionEditor } from "./question-editor";
import {
  draftFromQuestion,
  draftToPayload,
  validateDraft,
  QUESTION_TYPE_LABELS,
} from "./question-draft";

/** Conjunto de claves correctas (single/multiple/true_false), para el render. */
function correctKeys(q: QuizQuestion): Set<string> {
  const ca = q.correct_answer;
  if (Array.isArray(ca)) return new Set(ca);
  if (typeof ca === "string") return new Set([ca]);
  if (q.correct_option) return new Set([q.correct_option]);
  return new Set();
}

export function QuestionCard({
  question,
  index,
  onSave,
  onDelete,
}: {
  question: QuizQuestion;
  index: number;
  onSave: (questionId: string, payload: Record<string, unknown>) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftFromQuestion(question));
  const [showExplanation, setShowExplanation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const error = validateDraft(draft);

  const startEdit = () => {
    setDraft(draftFromQuestion(question));
    setExpanded(true);
    setEditing(true);
  };

  const handleSave = async () => {
    if (error) return;
    setSaving(true);
    const ok = await onSave(question.id, draftToPayload(draft));
    setSaving(false);
    if (ok) setEditing(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(question.id);
    setDeleting(false);
  };

  const correct = correctKeys(question);

  return (
    <div className="overflow-hidden rounded-xl border border-ca-ink/[0.08] bg-white">
      {/* Fila compacta (siempre): clic para expandir */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-expanded={expanded}
        >
          <span className="font-mono text-[12px] font-bold text-ca-ink-soft">
            #{String(index + 1).padStart(2, "0")}
          </span>
          <span className="shrink-0 rounded-full bg-ca-bg-soft px-2 py-0.5 text-[10px] font-bold text-ca-ink-soft">
            {QUESTION_TYPE_LABELS[question.question_type] ?? question.question_type}
          </span>
          <span className="truncate text-[13px] font-semibold text-ca-ink">
            {question.question_text}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {question.is_generated && (
            <span
              className="hidden rounded-full px-2 py-0.5 text-[10px] font-bold sm:inline"
              style={{ background: "rgba(94,23,235,0.10)", color: "var(--color-ca-violet)" }}
            >
              IA
            </span>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Colapsar" : "Expandir"}
            className="text-ca-ink-soft"
          >
            <ChevronIcon open={expanded} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-ca-ink/[0.06] px-5 py-4">
        {/* Sub-header: badges + editar */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                background: question.is_generated ? "rgba(94,23,235,0.10)" : "rgba(20,22,58,0.06)",
                color: question.is_generated ? "var(--color-ca-violet)" : "var(--color-ca-ink-soft)",
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
            onClick={() => (editing ? setEditing(false) : startEdit())}
            className="shrink-0 text-[12px] font-bold text-ca-violet hover:underline"
          >
            {editing ? "Cancelar" : "Editar"}
          </button>
        </div>

        {editing ? (
          <QuestionEditor draft={draft} onChange={setDraft} />
        ) : (
          <>
            <p className="text-[14px] font-semibold leading-relaxed text-ca-ink">
              {question.question_text}
            </p>

            {/* Render por tipo (read-only) */}
            {(question.question_type === "single_choice" ||
              question.question_type === "multiple_choice" ||
              question.question_type === "true_false") && (
              <div className="mt-3 grid gap-2">
                {Object.entries(question.options ?? {}).map(([key, label]) => {
                  const isCorrect = correct.has(key);
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <div
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                        style={{
                          background: isCorrect ? "rgba(168,211,16,0.22)" : "rgba(20,22,58,0.05)",
                          color: isCorrect ? "#3f5a05" : "var(--color-ca-ink-soft)",
                        }}
                      >
                        {isCorrect ? <CheckCircleIcon /> : key}
                      </div>
                      <span
                        className="text-[13px]"
                        style={{
                          color: isCorrect ? "#3f5a05" : "var(--color-ca-ink)",
                          fontWeight: isCorrect ? 700 : 500,
                        }}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {question.question_type === "short_answer" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(Array.isArray(question.correct_answer) ? question.correct_answer : []).map(
                  (ans, i) => (
                    <span
                      key={i}
                      className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
                      style={{ background: "rgba(168,211,16,0.18)", color: "#3f5a05" }}
                    >
                      {ans}
                    </span>
                  ),
                )}
              </div>
            )}

            {/* Explicación */}
            <div className="mt-3">
              <button
                onClick={() => setShowExplanation(!showExplanation)}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-ca-ink-soft hover:text-ca-ink"
              >
                <ChevronIcon open={showExplanation} />
                Explicación
              </button>
              {showExplanation && (
                <p className="mt-2 text-[13px] leading-relaxed text-ca-ink-soft">
                  {question.explanation || "Sin explicación"}
                </p>
              )}
            </div>
          </>
        )}

        {/* Acciones */}
        {editing && (
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !!error}
              title={error ?? undefined}
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
      )}
    </div>
  );
}
