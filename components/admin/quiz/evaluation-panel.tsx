"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/admin/toast";
import type { Evaluation, QuizQuestion } from "./types";
import { AddQuestionForm } from "./add-question-form";
import { QuestionCard } from "./question-card";
import { ShareQuizDialog } from "./share-quiz-dialog";
import { LoaderIcon, TrashIcon } from "./icons";

/**
 * Gestor genérico de UNA evaluación (cualquier scope): preguntas (4 tipos),
 * activar/desactivar, compartir (enlace + QR) y borrado seguro opcional.
 * Reusado por el panel de lección y por la pestaña central de evaluaciones.
 */
export function EvaluationPanel({
  evaluation,
  onEvaluationChange,
  onDeleted,
}: {
  evaluation: Evaluation;
  onEvaluationChange: (ev: Evaluation) => void;
  /** Si se provee, habilita el botón de borrar la evaluación. */
  onDeleted?: () => void;
}) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const { toast, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/evaluations/${evaluation.id}`);
      if (res.ok) {
        const { questions: qs } = await res.json();
        setQuestions(qs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [evaluation.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const toggleActive = async () => {
    if (!evaluation.is_active && questions.length === 0) {
      toast("Agrega al menos una pregunta antes de activar", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/evaluations/${evaluation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !evaluation.is_active }),
      });
      const data = await res.json();
      if (res.ok) {
        onEvaluationChange(data.evaluation);
        toast(data.evaluation.is_active ? "Evaluación activada" : "Evaluación desactivada", "success");
      } else {
        toast(data.error ?? "Error al actualizar", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (questionId: string, payload: Record<string, unknown>) => {
    const res = await fetch("/api/admin/quiz-questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, ...payload }),
    });
    if (res.ok) {
      const { question: updated } = await res.json();
      setQuestions((prev) => prev.map((p) => (p.id === questionId ? { ...p, ...updated } : p)));
      toast("Pregunta actualizada", "success");
      return true;
    }
    const err = await res.json().catch(() => ({ error: "Error al guardar" }));
    toast(err.error ?? "Error al guardar", "error");
    return false;
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/admin/quiz-questions?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setQuestions((prev) => prev.filter((p) => p.id !== id));
      toast("Pregunta eliminada", "success");
    } else {
      toast("Error al eliminar", "error");
    }
  };

  const handleDeleteEvaluation = async () => {
    if (!onDeleted) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/evaluations/${evaluation.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast("Evaluación eliminada", "success");
        onDeleted();
      } else {
        toast(data.error ?? "Error al eliminar la evaluación", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-8">
        <LoaderIcon />
      </div>
    );
  }

  return (
    <>
      <ToastContainer />
      <ShareQuizDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        evaluationId={evaluation.id}
        title={evaluation.title}
        isActive={evaluation.is_active}
      />

      <div className="space-y-4">
        {/* Estado + acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ca-bg-soft px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{
                background: evaluation.is_active ? "rgba(168,211,16,0.22)" : "rgba(20,22,58,0.08)",
                color: evaluation.is_active ? "#3f5a05" : "var(--color-ca-ink-soft)",
              }}
            >
              {evaluation.is_active ? "Activa" : "Borrador"}
            </span>
            <span className="text-[13px] font-semibold text-ca-ink">
              {questions.length} {questions.length === 1 ? "pregunta" : "preguntas"}
            </span>
            <span className="text-[12px] text-ca-ink-soft">· aprueba con {evaluation.passing_grade_pct}%</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12px] font-bold text-ca-ink transition-colors"
              style={{ borderColor: "rgba(20,22,58,0.14)" }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
              Compartir
            </button>
            <button
              onClick={toggleActive}
              disabled={busy}
              className="rounded-xl border px-4 py-2 text-[12px] font-bold transition-colors disabled:opacity-40"
              style={{
                borderColor: evaluation.is_active ? "rgba(20,22,58,0.14)" : "var(--color-ca-lime-deep)",
                color: evaluation.is_active ? "var(--color-ca-ink-soft)" : "#3f5a05",
                background: evaluation.is_active ? "transparent" : "rgba(168,211,16,0.12)",
              }}
            >
              {evaluation.is_active ? "Desactivar" : "Activar para alumnos"}
            </button>
          </div>
        </div>

        <AddQuestionForm evaluationId={evaluation.id} onAdded={(q) => setQuestions((p) => [...p, q])} />

        {questions.length > 0 && (
          <div className="flex flex-col gap-3">
            {questions.map((q, idx) => (
              <QuestionCard key={q.id} question={q} index={idx} onSave={handleSave} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {onDeleted && (
          <div className="flex justify-end border-t pt-3" style={{ borderColor: "rgba(20,22,58,0.08)" }}>
            <button
              onClick={handleDeleteEvaluation}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold text-red-600 transition-colors hover:text-red-700 disabled:opacity-40"
            >
              <TrashIcon />
              Eliminar evaluación
            </button>
          </div>
        )}
      </div>
    </>
  );
}
