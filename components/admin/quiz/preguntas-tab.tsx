"use client";

import { useState } from "react";
import { useToast } from "@/components/admin/toast";
import type { QuizQuestion } from "./types";
import { LoaderIcon, SparklesIcon } from "./icons";
import { QuestionCard } from "./question-card";
import { AddQuestionForm } from "./add-question-form";

export function PreguntasTab({
  programId,
  questions,
  setQuestions,
  loading,
}: {
  programId: string;
  questions: QuizQuestion[];
  setQuestions: React.Dispatch<React.SetStateAction<QuizQuestion[]>>;
  loading: boolean;
}) {
  const [generating, setGenerating] = useState(false);
  const { toast, ToastContainer } = useToast();

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      });
      if (res.ok) {
        const { questionCount } = await res.json();
        toast(`${questionCount} preguntas generadas con IA`, "success");
        // Refresh questions list
        const refresh = await fetch(`/api/admin/quiz-questions?programId=${programId}`);
        if (refresh.ok) {
          const { questions: fresh } = await refresh.json();
          setQuestions(fresh);
        }
      } else {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        toast(err.error ?? "Error al generar", "error");
      }
    } catch {
      toast("Error de conexion", "error");
    } finally {
      setGenerating(false);
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

  const handleAdded = (q: QuizQuestion) => {
    setQuestions((prev) => [...prev, q]);
  };

  return (
    <div>
      <ToastContainer />

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[13px] font-bold text-ca-ink">
            {questions.length} {questions.length === 1 ? "pregunta" : "preguntas"} en el pool
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition-colors disabled:opacity-60"
            style={{ background: "var(--color-ca-violet)" }}
          >
            {generating ? <LoaderIcon /> : <SparklesIcon />}
            {generating ? "Generando..." : "Generar con IA"}
          </button>
        </div>
      </div>

      {/* Add manual question form */}
      <div className="mb-4">
        <AddQuestionForm programId={programId} onAdded={handleAdded} />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="grid place-items-center py-16">
          <LoaderIcon />
          <p className="mt-3 text-[13px] font-semibold text-ca-ink-soft">Cargando preguntas...</p>
        </div>
      )}

      {/* Question list */}
      {!loading && questions.length === 0 && (
        <div className="grid place-items-center py-16">
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ca-bg-soft">
              <SparklesIcon />
            </div>
            <div className="mt-3 text-[14px] font-bold text-ca-ink">Sin preguntas</div>
            <div className="text-[12px] text-ca-ink-soft">
              Genera preguntas con IA o agrega manualmente.
            </div>
          </div>
        </div>
      )}

      {!loading && questions.length > 0 && (
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
  );
}
