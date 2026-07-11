"use client";

import { useState } from "react";
import { useToast } from "@/components/admin/toast";
import { Button } from "@/components/ui/button";
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
      toast("Error de conexión", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <>
        <ToastContainer />
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(true)}
          className="h-auto justify-start gap-2 rounded-xl border-2 border-dashed border-ca-ink/[0.10] px-4 py-3 text-[13px] font-bold text-ca-ink-soft hover:border-ca-violet/30 hover:bg-transparent hover:text-ca-violet"
        >
          <PlusIcon />
          Agregar pregunta manual
        </Button>
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
            <Button
              type="button"
              variant="lime"
              onClick={handleSubmit}
              disabled={saving || !!error}
              title={error ?? undefined}
              className="h-auto gap-2 px-5 py-2.5 text-[13px]"
            >
              {saving ? <LoaderIcon /> : <PlusIcon />}
              {saving ? "Guardando…" : "Agregar pregunta"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="h-auto px-4 py-2.5 text-[13px] font-semibold text-ca-ink-soft"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
