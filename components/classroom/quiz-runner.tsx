"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { UploadCloud } from "lucide-react";
import { QuizStart } from "./quiz-start";
import { QuizLocked } from "./quiz-locked";
import { EmptyState } from "@/components/ui/empty-state";

// Pantallas de llegada (QuizStart / QuizLocked) van eager. Las que aparecen tras
// una acción del alumno —siempre con un fetch de por medio (iniciar/enviar)— se
// cargan on-demand para no inflar el bundle inicial de la página de quiz; el
// breve loader queda enmascarado por ese fetch.
function QuizPhaseLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-ca-violet border-t-transparent" />
    </div>
  );
}

const QuizInProgress = dynamic(
  () => import("./quiz-in-progress").then((m) => m.QuizInProgress),
  { loading: QuizPhaseLoader },
);
const QuizResultPass = dynamic(() => import("./quiz-result-pass"), {
  loading: QuizPhaseLoader,
});
const QuizResultFail = dynamic(() => import("./quiz-result-fail"), {
  loading: QuizPhaseLoader,
});

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type QuizQuestion = { id: string; question_text: string; options: Record<string, string> };

type QuizConfig = {
  questionsPerAttempt: number;
  passingGradePct: number;
  maxAttempts: number;
  timeLimitMinutes?: number | null;
};

type GateState =
  | { status: "unconfigured" }
  | { status: "passed"; attemptsUsed: number; lastScore?: number }
  | {
      status: "locked_completion";
      currentPct: number;
      requiredPct: number;
      completedLessons: number;
      totalLessons: number;
    }
  | { status: "locked_attempts"; attemptsUsed: number; maxAttempts: number }
  | {
      status: "ready";
      hasInProgress: boolean;
      attemptsUsed: number;
      attemptsRemaining: number;
      lastScore?: number;
      config: QuizConfig;
    };

type SubmitResult = {
  score_pct: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  correctAnswers: Record<
    string,
    { correct_option: string; explanation: string | null; is_correct: boolean }
  >;
  attemptsRemaining: number;
  certificate: { verificationCode: string; pdfUrl: string } | null;
  certificateError: string | null;
};

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "gate"; gate: GateState }
  | {
      name: "in_progress";
      attemptId: string;
      questions: QuizQuestion[];
      config: QuizConfig;
      attempt: number;
      submitError?: string;
    }
  | {
      name: "result";
      result: SubmitResult;
      questions: QuizQuestion[];
      answers: Record<string, string>;
      config: QuizConfig;
      attempt: number;
      timeUsed: string;
    };

export type QuizRunnerProps = {
  programId: string;
  programTitle: string;
  studentName: string;
  cohortSlug: string;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="ca-fade-up flex h-full min-h-[60vh] w-full flex-col items-center justify-center gap-4 px-6 py-16 text-center"
      style={{ background: "var(--color-ca-bg)" }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function QuizRunner({ programId, programTitle, studentName, cohortSlug }: QuizRunnerProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [busy, setBusy] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  const loadGate = useCallback(async () => {
    setPhase({ name: "loading" });
    try {
      const res = await fetch(`/api/classroom/quiz?programId=${programId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ name: "error", message: data?.error ?? "No se pudo cargar el quiz" });
        return;
      }
      if (data.status === "passed") {
        router.replace(`/classroom/${cohortSlug}/certificado`);
        return;
      }
      setPhase({ name: "gate", gate: data as GateState });
    } catch {
      setPhase({ name: "error", message: "Error de red al cargar el quiz" });
    }
  }, [programId, cohortSlug, router]);

  useEffect(() => {
    // Carga inicial del estado del quiz: sincroniza con un sistema externo (la API).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGate();
  }, [loadGate]);

  const startAttempt = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/classroom/quiz/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ name: "error", message: data?.error ?? "No se pudo iniciar el quiz" });
        return;
      }
      startedAtRef.current = Date.now();
      setPhase({
        name: "in_progress",
        attemptId: data.attemptId,
        questions: data.questions ?? [],
        config: data.config,
        attempt: data.attempt ?? 1,
      });
    } catch {
      setPhase({ name: "error", message: "Error de red al iniciar el quiz" });
    } finally {
      setBusy(false);
    }
  }, [busy, programId]);

  const submitAttempt = useCallback(
    async (answers: Record<string, string>) => {
      if (phase.name !== "in_progress" || busy) return;
      setBusy(true);
      setPhase((prev) => (prev.name === "in_progress" ? { ...prev, submitError: undefined } : prev));
      const elapsed = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
      try {
        const res = await fetch(`/api/classroom/quiz/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ programId, attemptId: phase.attemptId, answers }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 409) {
            // El intento ya quedó cerrado en el servidor (posible respuesta perdida
            // en un intento de envío anterior): resincroniza en vez de exigir reenvío.
            await loadGate();
            return;
          }
          setPhase((prev) =>
            prev.name === "in_progress"
              ? { ...prev, submitError: data?.error ?? "No pudimos enviar tus respuestas" }
              : prev,
          );
          return;
        }
        setPhase({
          name: "result",
          result: data as SubmitResult,
          questions: phase.questions,
          answers,
          config: phase.config,
          attempt: phase.attempt,
          timeUsed: fmtElapsed(elapsed),
        });
      } catch {
        setPhase((prev) =>
          prev.name === "in_progress"
            ? { ...prev, submitError: "Error de red al enviar tus respuestas" }
            : prev,
        );
      } finally {
        setBusy(false);
      }
    },
    [phase, busy, programId, loadGate],
  );

  const goWorkshop = useCallback(() => router.push(`/classroom/${cohortSlug}`), [router, cohortSlug]);

  /* ---- Render ---- */

  if (phase.name === "loading") {
    return (
      <Centered>
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-ca-violet border-t-transparent"
          aria-label="Cargando"
        />
        <p className="text-[14px] font-semibold text-ca-ink-soft">Cargando tu evaluación…</p>
      </Centered>
    );
  }

  if (phase.name === "error") {
    return (
      <Centered>
        <h1 className="text-[22px] font-black tracking-tight text-ca-ink">No pudimos cargar el quiz</h1>
        <p className="max-w-md text-[14px] font-medium leading-relaxed text-ca-ink-soft">{phase.message}</p>
        <div className="mt-2 flex gap-3">
          <button
            onClick={loadGate}
            className="ca-btn-interactive ca-btn-lime inline-flex items-center gap-2 px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.08em]"
          >
            Reintentar
          </button>
          <button
            onClick={goWorkshop}
            className="ca-btn-interactive inline-flex items-center gap-2 rounded-full border border-ca-outline-strong px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.08em] text-ca-ink"
          >
            Volver al programa
          </button>
        </div>
      </Centered>
    );
  }

  if (phase.name === "in_progress") {
    return (
      <div key="in_progress" className="ca-fade-up">
      <QuizInProgress
        programTitle={programTitle}
        questions={phase.questions}
        timeLimitMinutes={phase.config.timeLimitMinutes ?? undefined}
        attempt={phase.attempt}
        maxAttempts={phase.config.maxAttempts}
        onSubmit={submitAttempt}
        onExit={goWorkshop}
        submitError={phase.submitError}
      />
      </div>
    );
  }

  if (phase.name === "result") {
    const { result, questions, answers, config, attempt, timeUsed } = phase;
    const byId = new Map(questions.map((q) => [q.id, q]));

    if (result.passed) {
      const review = questions.map((q) => ({
        questionId: q.id,
        questionText: q.question_text,
        topic: "",
        correct: result.correctAnswers[q.id]?.is_correct ?? false,
      }));
      return (
        <div key="result-pass" className="ca-fade-up">
        <QuizResultPass
          studentName={studentName}
          scorePct={result.score_pct}
          correctCount={result.correctCount}
          totalQuestions={result.totalQuestions}
          passingGradePct={config.passingGradePct}
          attempt={attempt}
          maxAttempts={config.maxAttempts}
          timeUsed={timeUsed}
          programTitle={programTitle}
          certificateReady={!!result.certificate}
          verificationCode={result.certificate?.verificationCode}
          onDownloadCert={() => {
            if (result.certificate?.pdfUrl) window.open(result.certificate.pdfUrl, "_blank");
          }}
          onViewCert={() => router.push(`/classroom/${cohortSlug}/certificado`)}
          onShareLinkedIn={() => {
            const url = result.certificate?.verificationCode
              ? `${window.location.origin}/verificar/${result.certificate.verificationCode}`
              : window.location.origin;
            window.open(
              `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
              "_blank",
            );
          }}
          onReviewAnswers={() => {}}
          correctAnswers={review}
        />
        </div>
      );
    }

    const wrong = questions
      .filter((q) => !(result.correctAnswers[q.id]?.is_correct ?? false))
      .map((q) => {
        const correctLetter = result.correctAnswers[q.id]?.correct_option;
        const yourLetter = answers[q.id];
        const opts = byId.get(q.id)?.options ?? {};
        return {
          questionText: q.question_text,
          topic: "",
          yourAnswer: yourLetter ? (opts[yourLetter] ?? yourLetter) : "Sin responder",
          correctAnswer: correctLetter ? (opts[correctLetter] ?? correctLetter) : "—",
        };
      });

    return (
      <div key="result-fail" className="ca-fade-up">
      <QuizResultFail
        studentName={studentName}
        scorePct={result.score_pct}
        correctCount={result.correctCount}
        totalQuestions={result.totalQuestions}
        passingGradePct={config.passingGradePct}
        attempt={attempt}
        maxAttempts={config.maxAttempts}
        timeUsed={timeUsed}
        attemptsRemaining={result.attemptsRemaining}
        wrongAnswers={wrong}
        onRetry={startAttempt}
        onReviewLessons={goWorkshop}
      />
      </div>
    );
  }

  // phase.name === "gate"
  const { gate } = phase;

  if (gate.status === "unconfigured") {
    return (
      <div className="ca-fade-up flex h-full min-h-[60vh] w-full items-center justify-center px-6 py-16">
        <EmptyState
          icon={UploadCloud}
          title="Próximamente"
          description="Tu evaluación final aún no está disponible. Cuando el equipo la publique, aparecerá aquí."
        />
      </div>
    );
  }

  if (gate.status === "locked_completion") {
    return (
      <QuizLocked
        currentPct={gate.currentPct}
        requiredPct={gate.requiredPct}
        completedLessons={gate.completedLessons}
        totalLessons={gate.totalLessons}
        remainingLessons={[]}
        cohortSlug={cohortSlug}
        moduleSlug=""
      />
    );
  }

  if (gate.status === "locked_attempts") {
    return (
      <Centered>
        <h1 className="text-[22px] font-black tracking-tight text-ca-ink">Sin intentos disponibles</h1>
        <p className="max-w-md text-[14px] font-medium leading-relaxed text-ca-ink-soft">
          Agotaste los {gate.maxAttempts} intento{gate.maxAttempts !== 1 ? "s" : ""} de tu evaluación.
          Contacta a operaciones si necesitas habilitar uno adicional con justificación.
        </p>
        <button
          onClick={goWorkshop}
          className="ca-btn-interactive mt-2 inline-flex items-center gap-2 rounded-full border border-ca-outline-strong px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.08em] text-ca-ink"
        >
          Volver al programa
        </button>
      </Centered>
    );
  }

  if (gate.status === "ready") {
    return (
      <QuizStart
        programTitle={programTitle}
        questionsPerAttempt={gate.config.questionsPerAttempt}
        passingGradePct={gate.config.passingGradePct}
        maxAttempts={gate.config.maxAttempts}
        attemptsUsed={gate.attemptsUsed}
        lastScore={gate.lastScore}
        timeLimitMinutes={gate.config.timeLimitMinutes ?? undefined}
        onStart={startAttempt}
        onBack={goWorkshop}
      />
    );
  }

  // 'passed' se maneja con redirect en loadGate; nunca se renderiza aquí.
  return null;
}
