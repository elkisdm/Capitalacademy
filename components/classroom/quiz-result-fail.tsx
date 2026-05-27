"use client";

import {
  Check,
  Clock,
  RefreshCw,
  Book,
  Play,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type WrongAnswer = {
  questionText: string;
  topic: string;
  yourAnswer: string;
  correctAnswer: string;
};

export type QuizResultFailProps = {
  studentName: string;
  scorePct: number;
  correctCount: number;
  totalQuestions: number;
  passingGradePct: number;
  attempt: number;
  maxAttempts: number;
  timeUsed: string;
  attemptsRemaining: number;
  wrongAnswers: WrongAnswer[];
  onRetry: () => void;
  onReviewLessons: () => void;
};

/* ------------------------------------------------------------------ */
/*  Score bar (fail variant — rose gradient)                           */
/* ------------------------------------------------------------------ */

function ScoreBar({
  value,
  threshold = 70,
  height = 16,
}: {
  value: number;
  threshold?: number;
  height?: number;
}) {
  return (
    <div className="relative w-full" style={{ height }}>
      <div className="shape-circle absolute inset-0 overflow-hidden bg-ca-bg-soft">
        <div
          className="shape-circle h-full"
          style={{
            width: `${value}%`,
            background: "linear-gradient(90deg, #c97099, #d14a6b)",
          }}
        />
      </div>
      {/* Threshold marker */}
      <div
        className="absolute top-1/2 -translate-y-1/2"
        style={{
          left: `calc(${threshold}% - 1px)`,
          height: height + 12,
          width: 2,
          background: "var(--color-ca-ink)",
          borderRadius: 2,
        }}
      />
      <div
        className="absolute -top-7 whitespace-nowrap font-mono text-[10px] font-bold"
        style={{
          left: `calc(${threshold}% - 16px)`,
          color: "var(--color-ca-ink-soft)",
        }}
      >
        MIN {threshold}%
      </div>
      <div
        className="absolute -top-7 whitespace-nowrap font-mono text-[10px] font-bold"
        style={{
          left: `calc(${value}% - 14px)`,
          color: "var(--color-ca-rose)",
        }}
      >
        TU {value}%
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat cell                                                          */
/* ------------------------------------------------------------------ */

function StatCell({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <div className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
        {label}
      </div>
      <div
        className={`mt-1 ${mono ? "font-mono" : ""} text-[20px] font-black leading-none tracking-tight text-ca-ink`}
      >
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function QuizResultFail({
  studentName,
  scorePct,
  correctCount,
  totalQuestions,
  passingGradePct,
  attempt,
  maxAttempts,
  timeUsed,
  attemptsRemaining,
  wrongAnswers,
  onRetry,
  onReviewLessons,
}: QuizResultFailProps) {
  const deficit = passingGradePct - scorePct;
  const neededCorrect = Math.ceil((passingGradePct / 100) * totalQuestions);
  const noAttemptsLeft = attemptsRemaining <= 0;

  return (
    <div className="relative flex w-full flex-col overflow-y-auto bg-ca-bg">
      {/* ── Hero band — soft violet mist (empathetic, NOT red) ── */}
      <section className="relative overflow-hidden bg-ca-violet-mist">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
        >
          <div className="shape-circle absolute -right-16 -top-16 h-56 w-56 bg-ca-violet opacity-10" />
          <div className="shape-half-right absolute -bottom-6 -left-6 h-32 w-32 bg-ca-violet-soft opacity-50" />
          <div className="shape-circle absolute right-1/4 top-10 h-3 w-3 bg-ca-violet" />
        </div>

        <div className="relative grid items-center gap-8 px-8 py-10 md:px-12 lg:grid-cols-[auto_1fr_auto]">
          {/* X badge — violet, NOT red */}
          <div
            className="shape-circle grid place-items-center"
            style={{
              width: 108,
              height: 108,
              background: "#fff",
              border: "4px solid var(--color-ca-violet-soft)",
            }}
          >
            <div
              className="shape-circle grid place-items-center bg-ca-violet-deep"
              style={{ width: 76, height: 76 }}
            >
              <svg
                width={42}
                height={42}
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
          </div>

          {/* Headline */}
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]"
              style={{
                background: "var(--color-ca-ink)",
                color: "#fff",
              }}
            >
              No alcanzaste el mínimo
            </div>
            <h1 className="mt-3 text-[32px] font-black leading-[1] tracking-[-0.03em] text-ca-ink md:text-[40px]">
              Esta vez no fue,
              <br />
              pero estuviste cerca.
            </h1>
            <p className="mt-3 max-w-md text-[14px] font-semibold leading-relaxed text-ca-ink">
              Te falta poco. Repasa los temas que fallaste y vuelve cuando te
              sientas listo.
              {!noAttemptsLeft && (
                <>
                  {" "}
                  Te quedan{" "}
                  <strong>
                    {attemptsRemaining} intento
                    {attemptsRemaining !== 1 ? "s" : ""}
                  </strong>
                  .
                </>
              )}
            </p>
          </div>

          {/* Score */}
          <div className="text-right">
            <div className="font-mono text-[9.5px] font-black uppercase tracking-[0.22em] text-ca-ink-soft">
              Tu puntaje
            </div>
            <div
              className="font-black leading-none tracking-[-0.045em] text-ca-ink"
              style={{ fontSize: 96 }}
            >
              {scorePct}
              <span
                className="text-ca-violet"
                style={{ fontSize: 50 }}
              >
                %
              </span>
            </div>
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ca-ink">
              Faltaron {deficit} pts
            </div>
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="relative px-8 py-10 md:px-12">
        {/* Score bar card */}
        <div className="ca-card p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ca-ink-soft">
                Desempeño
              </div>
              <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-ca-ink">
                {correctCount} de {totalQuestions} respuestas correctas ·
                necesitas {neededCorrect}
              </h3>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ca-violet-mist px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.16em] text-ca-violet-deep">
              <RefreshCw size={11} strokeWidth={2.5} />
              {noAttemptsLeft
                ? "Sin intentos"
                : `Quedan ${attemptsRemaining} intento${attemptsRemaining !== 1 ? "s" : ""}`}
            </span>
          </div>

          <div className="mb-4 mt-12">
            <ScoreBar
              value={scorePct}
              threshold={passingGradePct}
              height={16}
            />
          </div>

          <div
            className="mt-8 grid grid-cols-2 gap-4 border-t pt-5 sm:grid-cols-4"
            style={{ borderColor: "var(--color-ca-outline)" }}
          >
            <StatCell
              label="Correctas"
              value={`${correctCount} / ${totalQuestions}`}
            />
            <StatCell label="Tiempo" value={timeUsed} />
            <StatCell
              label="Intento"
              value={`${attempt} / ${maxAttempts}`}
            />
            <StatCell label="Mínimo" value={`${passingGradePct}%`} />
          </div>
        </div>

        {/* Wrong answers + actions */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Wrong answers review */}
          <div className="ca-card overflow-hidden">
            <div
              className="border-b px-6 py-4"
              style={{ borderColor: "var(--color-ca-outline)" }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-extrabold tracking-tight text-ca-ink">
                  Lo que fallo · {wrongAnswers.length} pregunta
                  {wrongAnswers.length !== 1 ? "s" : ""}
                </h3>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ca-bg-soft px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ca-ink">
                  Aprende y vuelve
                </span>
              </div>
            </div>
            <div
              className="divide-y"
              style={{ borderColor: "var(--color-ca-outline)" }}
            >
              {wrongAnswers.map((w, i) => (
                <div key={i} className="px-6 py-5">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.16em]"
                      style={{
                        background: "#fdebef",
                        color: "var(--color-ca-rose)",
                      }}
                    >
                      <svg
                        width={11}
                        height={11}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                      Incorrecta
                    </span>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                      {w.topic}
                    </span>
                  </div>
                  <div className="mt-2 text-[14px] font-extrabold leading-snug tracking-tight text-ca-ink">
                    {w.questionText}
                  </div>
                  <div className="mt-3 grid gap-2 text-[12.5px] leading-relaxed text-ca-ink-soft">
                    {/* Your answer */}
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-0.5 font-mono text-[10px] font-black uppercase tracking-[0.2em]"
                        style={{ color: "var(--color-ca-rose)" }}
                      >
                        TU
                      </span>
                      <span>{w.yourAnswer}</span>
                    </div>
                    {/* Correct answer */}
                    <div
                      className="flex items-start gap-2 rounded-lg p-2.5"
                      style={{
                        background: "var(--color-ca-lime-mist)",
                      }}
                    >
                      <span className="mt-0.5 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#3f5a05]">
                        OK
                      </span>
                      <span className="text-ca-ink">
                        {w.correctAnswer}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex flex-col gap-4">
            {/* Review lessons card */}
            <div className="ca-card p-6">
              <div className="shape-circle grid h-10 w-10 place-items-center bg-ca-violet-mist text-ca-violet">
                <Book size={18} strokeWidth={2} />
              </div>
              <h4 className="mt-3 text-[15px] font-extrabold tracking-tight text-ca-ink">
                Repasa antes de reintentar
              </h4>
              <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-ca-ink-soft">
                Te recomendamos volver a las lecciones donde te equivocaste
                antes de intentar de nuevo.
              </p>
              <button
                onClick={onReviewLessons}
                className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-ca-ink px-5 text-[12.5px] font-bold uppercase tracking-[0.08em] text-white"
              >
                <Play size={15} strokeWidth={2} />
                Repasar lecciones
              </button>
            </div>

            {/* Retry dark card */}
            <div
              className="ca-card relative overflow-hidden p-6"
              style={{
                background: "var(--color-ca-ink)",
                color: "#fff",
                borderColor: "var(--color-ca-ink)",
              }}
            >
              <div
                aria-hidden
                className="shape-circle absolute -right-6 -top-6 h-24 w-24 bg-ca-violet opacity-50"
              />
              <div className="relative">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/[0.18] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white">
                  Listo cuando tu
                </span>
                <h4 className="mt-3 text-[18px] font-black leading-tight tracking-tight">
                  ¿Te sientes preparado?
                </h4>
                <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-white/[0.78]">
                  Puedes reintentar cuando quieras. No hay tiempo limite.
                </p>
                <button
                  onClick={onRetry}
                  disabled={noAttemptsLeft}
                  className="ca-btn-lime mt-4 inline-flex h-11 items-center gap-2 px-5 text-[12.5px] font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reintentar quiz
                  <ArrowRight size={15} strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* No attempts left warning */}
            {noAttemptsLeft && (
              <div
                className="rounded-2xl p-4 text-[11.5px] font-medium leading-relaxed"
                style={{
                  background: "#fff7e6",
                  border: "1px dashed var(--color-ca-amber)",
                }}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    size={14}
                    strokeWidth={2}
                    className="mt-0.5 shrink-0"
                    style={{ color: "var(--color-ca-amber)" }}
                  />
                  <div>
                    <div className="text-[12px] font-extrabold tracking-tight text-ca-ink">
                      Sin intentos disponibles
                    </div>
                    <span className="text-ca-ink-soft">
                      Agotaste los {maxAttempts} intentos. Contacta a
                      operaciones — podemos habilitarte uno adicional con
                      justificación.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
