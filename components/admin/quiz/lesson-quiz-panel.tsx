"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/admin/toast";
import type { Evaluation, QuizQuestion } from "./types";
import { AddQuestionForm } from "./add-question-form";
import { QuestionCard } from "./question-card";
import { LoaderIcon } from "./icons";

/**
 * Panel de evaluación de una clase, embebido en el editor de lección.
 * Crea (si no existe) y gestiona la evaluación `scope='lesson'` ligada a la
 * lección: preguntas (todos los tipos), activación y borrado seguro.
 */
export function LessonQuizPanel({
  programId,
  lessonId,
  lessonTitle,
}: {
  programId: string;
  lessonId: string;
  lessonTitle: string;
}) {
  const [loading, setLoading] = useState(true);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  const { toast, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/evaluations?programId=${programId}&scope=lesson&lessonId=${lessonId}`,
      );
      const data = await res.json();
      const ev: Evaluation | undefined = data.evaluations?.[0];
      setEvaluation(ev ?? null);
      if (ev) {
        const det = await fetch(`/api/admin/evaluations/${ev.id}`);
        if (det.ok) {
          const { questions: qs } = await det.json();
          setQuestions(qs ?? []);
        }
      } else {
        setQuestions([]);
      }
    } finally {
      setLoading(false);
    }
  }, [programId, lessonId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const createEvaluation = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          scope: "lesson",
          lessonId,
          title: `Evaluación: ${lessonTitle}`,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEvaluation(data.evaluation);
        setQuestions([]);
        toast("Evaluación creada", "success");
      } else {
        toast(data.error ?? "Error al crear", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    if (!evaluation) return;
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
        setEvaluation(data.evaluation);
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

  if (loading) {
    return (
      <div className="grid place-items-center py-8">
        <LoaderIcon />
      </div>
    );
  }

  if (!evaluation) {
    return (
      <>
        <ToastContainer />
        <div className="rounded-xl border-2 border-dashed border-ca-ink/[0.10] p-6 text-center">
          <p className="text-[14px] font-semibold text-ca-ink">
            Esta clase no tiene una evaluación.
          </p>
          <p className="mt-1 text-[13px] text-ca-ink-soft">
            Crea un quiz formativo para que el alumno lo responda al terminar la clase.
          </p>
          <button
            onClick={createEvaluation}
            disabled={busy}
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-ca-ink transition-colors disabled:opacity-40"
            style={{ background: "var(--color-ca-lime)" }}
          >
            {busy ? <LoaderIcon /> : null}
            Crear evaluación de la clase
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <ToastContainer />
      <div className="space-y-4">
        {/* Estado */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ca-bg-soft px-4 py-3">
          <div className="flex items-center gap-2">
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
            <span className="text-[12px] text-ca-ink-soft">
              · aprueba con {evaluation.passing_grade_pct}%
            </span>
          </div>
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

        <AddQuestionForm evaluationId={evaluation.id} onAdded={(q) => setQuestions((p) => [...p, q])} />

        {questions.length > 0 && (
          <div className="flex flex-col gap-3">
            {questions.map((q, idx) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={idx}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
