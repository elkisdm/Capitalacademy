"use client";

import { useState } from "react";
import { useToast } from "@/components/admin/toast";
import type { QuizQuestion } from "./types";
import { LoaderIcon, PlusIcon } from "./icons";
import { QuestionEditor } from "./question-editor";
import { emptyDraft, draftToPayload, validateDraft } from "./question-draft";

export function AddQuestionForm({
  programId,
  evaluationId,
  onAdded,
}: {
  programId?: string;
  evaluationId?: string;
  onAdded: (q: QuizQuestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const { toast, ToastContainer } = useToast();

  const error = validateDraft(draft);

  const reset = () => setDraft(emptyDraft());

  const handleSubmit = async () => {
    if (error) {
      toast(error, "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/quiz-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(evaluationId ? { evaluationId } : { programId }),
          ...draftToPayload(draft),
        }),
      });
      if (res.ok) {
        const { question } = await res.json();
        onAdded(question);
        reset();
        setOpen(false);
        toast("Pregunta agregada", "success");
      } else {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        toast(err.error ?? "Error al agregar", "error");
      }
    } catch {
      toast("Error de conexion", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <>
        <ToastContainer />
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-xl border-2 border-dashed border-ca-ink/[0.10] px-4 py-3 text-[13px] font-bold text-ca-ink-soft transition-colors hover:border-ca-violet/30 hover:text-ca-violet"
        >
          <PlusIcon />
          Agregar pregunta manual
        </button>
      </>
    );
  }

  return (
    <>
      <ToastContainer />
      <div className="ca-card overflow-hidden border-2 border-ca-violet/20">
        <div className="border-b border-ca-ink/[0.06] bg-ca-bg-soft px-5 py-3">
          <span className="text-[13px] font-bold text-ca-ink">Nueva pregunta manual</span>
        </div>
        <div className="space-y-4 p-5">
          <QuestionEditor draft={draft} onChange={setDraft} />

          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={saving || !!error}
              title={error ?? undefined}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-ca-ink transition-colors disabled:opacity-40"
              style={{ background: "var(--color-ca-lime)" }}
            >
              {saving ? <LoaderIcon /> : <PlusIcon />}
              {saving ? "Guardando..." : "Agregar pregunta"}
            </button>
            <button
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-ca-ink-soft transition-colors hover:bg-ca-bg-soft"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
