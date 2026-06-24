"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/admin/toast";
import type { Evaluation } from "./types";
import { EvaluationPanel } from "./evaluation-panel";
import { LoaderIcon } from "./icons";

/**
 * Panel de evaluación de una clase EN VIVO, embebido en el editor de sesiones de
 * la cohorte. Crea (si no existe) la evaluación `scope='session'` ligada a la
 * sesión y delega su gestión (preguntas, activar, compartir por QR) en
 * `EvaluationPanel`. Espeja `lesson-quiz-panel`, pero el target es una sesión.
 */
export function SessionQuizPanel({
  programId,
  sessionId,
  sessionLabel,
}: {
  programId: string;
  sessionId: string;
  sessionLabel: string;
}) {
  const [loading, setLoading] = useState(true);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, ToastContainer } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/evaluations?programId=${programId}&scope=session&sessionId=${sessionId}`,
      );
      const data = await res.json();
      setEvaluation(data.evaluations?.[0] ?? null);
    } finally {
      setLoading(false);
    }
  }, [programId, sessionId]);

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
          scope: "session",
          sessionId,
          title: `Quiz de clase: ${sessionLabel}`,
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
          <p className="text-[14px] font-semibold text-ca-ink">Esta clase en vivo no tiene un quiz.</p>
          <p className="mt-1 text-[13px] text-ca-ink-soft">
            Crea un quiz formativo y compártelo por enlace o QR durante la clase.
          </p>
          <button
            onClick={createEvaluation}
            disabled={busy}
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold text-ca-ink transition-colors disabled:opacity-40"
            style={{ background: "var(--color-ca-lime)" }}
          >
            {busy ? <LoaderIcon /> : null}
            Crear quiz de la clase
          </button>
        </div>
      </>
    );
  }

  return <EvaluationPanel evaluation={evaluation} onEvaluationChange={setEvaluation} />;
}
