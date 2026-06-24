"use client";

import { useCallback, useEffect, useState } from "react";
import { QuestionInput, type RunnerQuestion, type AnswerValue } from "./question-input";

type Config = {
  questionsPerAttempt: number | null;
  passingGradePct: number;
  maxAttempts: number;
  timeLimitMinutes: number | null;
};

type State = {
  title: string;
  config: Config;
  attemptsUsed: number;
  attemptsRemaining: number;
  hasInProgress: boolean;
  bestScore: number | null;
  passed: boolean;
};

type SubmitResult = {
  score_pct: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  review: Record<string, { correct_answer: unknown; is_correct: boolean }>;
  attemptsRemaining: number;
};

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "intro"; state: State }
  | { name: "in_progress"; attemptId: string; questions: RunnerQuestion[]; config: Config }
  | {
      name: "result";
      result: SubmitResult;
      questions: RunnerQuestion[];
      answers: Record<string, AnswerValue>;
      passingGradePct: number;
    };

export function EvaluationRunner({
  evaluationId,
  title,
}: {
  evaluationId: string;
  title: string;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [busy, setBusy] = useState(false);

  const loadState = useCallback(async () => {
    setPhase({ name: "loading" });
    try {
      const res = await fetch(`/api/classroom/evaluation?evaluationId=${evaluationId}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ name: "error", message: data?.error ?? "No se pudo cargar la evaluación" });
        return;
      }
      setPhase({ name: "intro", state: data as State });
    } catch {
      setPhase({ name: "error", message: "Error de red al cargar la evaluación" });
    }
  }, [evaluationId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadState();
  }, [loadState]);

  const start = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setAnswers({});
    try {
      const res = await fetch(`/api/classroom/evaluation/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evaluationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ name: "error", message: data?.error ?? "No se pudo iniciar" });
        return;
      }
      setPhase({
        name: "in_progress",
        attemptId: data.attemptId,
        questions: data.questions ?? [],
        config: data.config,
      });
    } catch {
      setPhase({ name: "error", message: "Error de red al iniciar" });
    } finally {
      setBusy(false);
    }
  }, [busy, evaluationId]);

  const submit = useCallback(async () => {
    if (phase.name !== "in_progress" || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/classroom/evaluation/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evaluationId, attemptId: phase.attemptId, answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ name: "error", message: data?.error ?? "No se pudo enviar" });
        return;
      }
      setPhase({
        name: "result",
        result: data as SubmitResult,
        questions: phase.questions,
        answers,
        passingGradePct: phase.config.passingGradePct,
      });
    } catch {
      setPhase({ name: "error", message: "Error de red al enviar" });
    } finally {
      setBusy(false);
    }
  }, [phase, busy, evaluationId, answers]);

  /* ---- Render ---- */

  if (phase.name === "loading") {
    return <Shell title={title}><Spinner /></Shell>;
  }

  if (phase.name === "error") {
    return (
      <Shell title={title}>
        <p className="text-[13px] font-medium text-ca-ink-soft">{phase.message}</p>
        <button onClick={loadState} className="mt-3 text-[13px] font-bold text-ca-violet hover:underline">
          Reintentar
        </button>
      </Shell>
    );
  }

  if (phase.name === "intro") {
    const { state } = phase;
    const exhausted = state.attemptsRemaining <= 0;
    return (
      <Shell title={title}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ca-ink-soft">
          <span>Aprueba con <b className="text-ca-ink">{state.config.passingGradePct}%</b></span>
          <span>·</span>
          <span>Intentos: {state.attemptsUsed}/{state.config.maxAttempts}</span>
          {state.bestScore !== null && (
            <>
              <span>·</span>
              <span>Mejor nota: <b style={{ color: state.passed ? "#3f5a05" : "var(--color-ca-ink)" }}>{state.bestScore}%</b></span>
            </>
          )}
        </div>
        {state.passed && (
          <p className="mt-2 inline-flex rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: "rgba(168,211,16,0.2)", color: "#3f5a05" }}>
            ✓ Aprobada
          </p>
        )}
        {!exhausted ? (
          <button
            onClick={start}
            disabled={busy}
            className="ca-btn-interactive ca-btn-lime mt-4 inline-flex items-center gap-2 px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.08em] disabled:pointer-events-none disabled:opacity-50"
          >
            {state.hasInProgress ? "Continuar evaluación" : state.attemptsUsed > 0 ? "Volver a intentar" : "Comenzar evaluación"}
          </button>
        ) : (
          <p className="mt-4 text-[13px] font-semibold text-ca-ink-soft">
            Usaste todos tus intentos. {state.bestScore !== null && `Tu mejor nota fue ${state.bestScore}%.`}
          </p>
        )}
      </Shell>
    );
  }

  if (phase.name === "in_progress") {
    const allAnswered = phase.questions.every((q) => hasAnswer(answers[q.id]));
    return (
      <Shell title={title}>
        <div className="flex flex-col gap-5">
          {phase.questions.map((q, i) => (
            <div
              key={q.id}
              className="ca-fade-up ca-stagger"
              style={{ "--i": i } as React.CSSProperties}
            >
              <p className="mb-2 text-[14px] font-bold text-ca-ink">
                <span className="mr-2 font-mono text-[12px] text-ca-ink-soft">{i + 1}.</span>
                {q.question_text}
              </p>
              <QuestionInput
                question={q}
                value={answers[q.id]}
                onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={busy}
            className="ca-btn-interactive ca-btn-lime inline-flex items-center gap-2 px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.08em] disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? "Enviando..." : "Enviar respuestas"}
          </button>
          {!allAnswered && (
            <span className="text-[12px] font-medium text-ca-ink-soft">
              Puedes enviar; lo no respondido cuenta como incorrecto.
            </span>
          )}
        </div>
      </Shell>
    );
  }

  // result
  const { result, questions, answers: given, passingGradePct } = phase;
  return (
    <Shell title={title}>
      <div className="flex items-center gap-3">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-[18px] font-black"
          style={{
            background: result.passed ? "rgba(168,211,16,0.2)" : "rgba(220,38,38,0.1)",
            color: result.passed ? "#3f5a05" : "#dc2626",
          }}
        >
          {result.score_pct}%
        </div>
        <div>
          <p className="text-[15px] font-black text-ca-ink">
            {result.passed ? "¡Aprobaste!" : "Sigue practicando"}
          </p>
          <p className="text-[13px] text-ca-ink-soft">
            {result.correctCount}/{result.totalQuestions} correctas · aprueba con {passingGradePct}%
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-5">
        {questions.map((q, i) => {
          const r = result.review[q.id];
          return (
            <div key={q.id}>
              <p className="mb-2 flex items-start gap-2 text-[14px] font-bold text-ca-ink">
                <span className="font-mono text-[12px] text-ca-ink-soft">{i + 1}.</span>
                <span>{q.question_text}</span>
                <span className="ml-auto shrink-0 text-[12px] font-bold" style={{ color: r?.is_correct ? "#3f5a05" : "#dc2626" }}>
                  {r?.is_correct ? "✓" : "✗"}
                </span>
              </p>
              <QuestionInput
                question={q}
                value={given[q.id]}
                review={{ correctAnswer: r?.correct_answer, isCorrect: r?.is_correct ?? false }}
              />
            </div>
          );
        })}
      </div>

      {result.attemptsRemaining > 0 && (
        <button onClick={start} disabled={busy} className="ca-btn-interactive mt-5 inline-flex rounded-full px-4 py-2 text-[13px] font-bold text-ca-violet transition-colors hover:bg-ca-violet/[0.06] disabled:pointer-events-none disabled:opacity-50">
          Volver a intentar ({result.attemptsRemaining} {result.attemptsRemaining === 1 ? "intento" : "intentos"} restantes)
        </button>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ca-fade-up ca-card p-5 md:p-6">
      <h3 className="mb-3 text-[15px] font-black tracking-tight text-ca-ink">{title}</h3>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div className="grid place-items-center py-6">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-ca-violet border-t-transparent" aria-label="Cargando" />
    </div>
  );
}

function hasAnswer(v: AnswerValue): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return typeof v === "string" && v.trim() !== "";
}
