"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    const ok = window.confirm("¿Eliminar esta pregunta? Esta acción no se puede deshacer.");
    if (!ok) return;
    setDeleting(true);
    await onDelete(question.id);
    setDeleting(false);
  };

  const correct = correctKeys(question);

  return (
    <div className="overflow-hidden rounded-xl border border-ca-ink/[0.08] bg-white">
      {/* Fila compacta (siempre): clic para expandir */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setExpanded((v) => !v)}
          className="h-auto min-w-0 flex-1 justify-start gap-2.5 rounded-none bg-transparent p-0 text-left font-normal hover:bg-transparent"
          aria-expanded={expanded}
        >
          <span className="font-mono text-[12px] font-bold text-ca-ink-soft">
            #{String(index + 1).padStart(2, "0")}
          </span>
          <Badge tone="neutral" size="sm" className="shrink-0">
            {QUESTION_TYPE_LABELS[question.question_type] ?? question.question_type}
          </Badge>
          <span className="truncate text-[13px] font-semibold text-ca-ink">
            {question.question_text}
          </span>
        </Button>
        <div className="flex shrink-0 items-center gap-2">
          {question.is_generated && (
            <Badge tone="violet" size="sm" className="hidden sm:inline-flex">
              IA
            </Badge>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Colapsar" : "Expandir"}
            className="!h-auto !w-auto rounded-full p-1 text-ca-ink-soft"
          >
            <ChevronIcon open={expanded} />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-ca-ink/[0.06] px-5 py-4">
        {/* Sub-header: badges + editar */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={question.is_generated ? "violet" : "neutral"} size="sm">
              {question.is_generated ? "IA" : "Manual"}
            </Badge>
            {question.lessons?.title && (
              <Badge tone="neutral" size="sm">
                {question.lessons.title}
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => (editing ? setEditing(false) : startEdit())}
            className="h-auto shrink-0 px-0 py-0 text-[12px] font-bold text-ca-violet hover:bg-transparent hover:underline"
          >
            {editing ? "Cancelar" : "Editar"}
          </Button>
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowExplanation(!showExplanation)}
                className="h-auto gap-1.5 px-0 py-0 text-[12px] font-semibold text-ca-ink-soft hover:bg-transparent hover:text-ca-ink"
              >
                <ChevronIcon open={showExplanation} />
                Explicación
              </Button>
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
            <Button
              type="button"
              variant="lime"
              onClick={handleSave}
              disabled={saving || !!error}
              title={error ?? undefined}
              className="h-auto gap-2 px-4 py-2 text-[13px]"
            >
              {saving ? <LoaderIcon /> : <CheckCircleIcon />}
              Guardar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting}
              className="h-auto gap-2 px-4 py-2 text-[13px] font-bold text-red-600/70 hover:bg-red-50 hover:text-red-600"
            >
              {deleting ? <LoaderIcon /> : <TrashIcon />}
              Eliminar
            </Button>
          </div>
        )}
        </div>
      )}
    </div>
  );
}
