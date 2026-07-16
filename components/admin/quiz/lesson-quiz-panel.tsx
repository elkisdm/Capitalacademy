"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/admin/toast";
import type { Evaluation, EvaluationKind } from "./types";
import { EvaluationPanel } from "./evaluation-panel";
import { LoaderIcon } from "./icons";

/**
 * Panel de evaluación de una clase, embebido en el editor de lección. Esta ES
 * la vía "desde la lección" (Paso 7f / corrección A2 del brief evaluaciones y
 * notas 1-7): crea (si no existe) la evaluación `scope='lesson'` ligada a la
 * lección, con el tipo que elija el profe (quiz autocorregido o nota manual
 * — ej. el roleplay del módulo práctico), y delega su gestión en
 * `EvaluationPanel`.
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
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<EvaluationKind>("quiz");
  const { toast, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/evaluations?programId=${programId}&scope=lesson&lessonId=${lessonId}`,
      );
      const data = await res.json();
      setEvaluation(data.evaluations?.[0] ?? null);
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
          kind,
          title: `Evaluación: ${lessonTitle}`,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEvaluation(data.evaluation);
        toast("Evaluación creada", "success");
      } else {
        toast(data.error ?? "Error al crear", "error");
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

  if (!evaluation) {
    return (
      <>
        <ToastContainer />
        <div className="rounded-xl border-2 border-dashed border-ca-ink/[0.10] p-6 text-center">
          <p className="text-[14px] font-semibold text-ca-ink">Esta clase no tiene una evaluación.</p>
          <p className="mt-1 text-[13px] text-ca-ink-soft">
            Un quiz se autocorrige; una nota manual la calificas tú (ej. un roleplay).
          </p>
          <div className="mx-auto mt-4 flex max-w-xs items-center gap-1 rounded-2xl bg-ca-bg-soft p-1">
            {(["quiz", "manual"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex-1 rounded-xl px-3 py-1.5 text-[12px] font-bold transition-colors ${
                  kind === k ? "bg-white text-ca-ink shadow-sm" : "text-ca-ink-soft hover:text-ca-ink"
                }`}
              >
                {k === "quiz" ? "Quiz" : "Nota manual"}
              </button>
            ))}
          </div>
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

  return <EvaluationPanel evaluation={evaluation} onEvaluationChange={setEvaluation} />;
}
