"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  Download,
  Eye,
  ChevronRight,
  Trophy,
  Sparkles,
  ArrowRight,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AnswerReview = {
  questionId: string;
  questionText: string;
  topic: string;
  correct: boolean;
};

export type QuizResultPassProps = {
  studentName: string;
  scorePct: number;
  correctCount: number;
  totalQuestions: number;
  passingGradePct: number;
  attempt: number;
  maxAttempts: number;
  timeUsed: string;
  programTitle: string;
  certificateReady: boolean;
  verificationCode?: string;
  onDownloadCert: () => void;
  onViewCert: () => void;
  onShareLinkedIn: () => void;
  onReviewAnswers: () => void;
  correctAnswers: AnswerReview[];
};

/* ------------------------------------------------------------------ */
/*  Confetti (deterministic, CSS-only)                                 */
/* ------------------------------------------------------------------ */

const CONFETTI_COLORS = [
  "var(--color-ca-lime)",
  "var(--color-ca-violet)",
  "var(--color-ca-violet-soft)",
  "#fff",
  "var(--color-ca-lime-deep)",
];

function Confetti({ count = 22 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 47) % 100,
        top: (i * 31) % 80,
        delay: (i * 0.17) % 2,
        dur: 2.8 + (i % 4) * 0.4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        isCircle: i % 3 === 0,
      })),
    [count],
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {pieces.map((p, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${p.left}%`,
            top: `${p.top - 30}px`,
            width: p.isCircle ? 8 : 6,
            height: p.isCircle ? 8 : 14,
            background: p.color,
            borderRadius: p.isCircle ? 9999 : 2,
            animation: `ca-confetti-fall ${p.dur}s ease-in ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Score bar with threshold line                                      */
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
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setWidth(value));
    return () => cancelAnimationFrame(t);
  }, [value]);

  return (
    <div className="relative w-full" style={{ height }}>
      <div
        className="shape-circle absolute inset-0 overflow-hidden bg-ca-bg-soft"
      >
        <div
          className="shape-circle h-full transition-[width] duration-700 ease-out"
          style={{
            width: `${width}%`,
            background:
              "linear-gradient(90deg, var(--color-ca-lime-deep), var(--color-ca-lime))",
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
          color: "var(--color-ca-lime-deep)",
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

export default function QuizResultPass({
  studentName,
  scorePct,
  correctCount,
  totalQuestions,
  passingGradePct,
  attempt,
  maxAttempts,
  timeUsed,
  programTitle,
  certificateReady,
  verificationCode,
  onDownloadCert,
  onViewCert,
  onShareLinkedIn,
  onReviewAnswers,
  correctAnswers,
}: QuizResultPassProps) {
  const surplus = scorePct - passingGradePct;
  const wrongCount = correctAnswers.filter((a) => !a.correct).length;

  return (
    <div className="ca-fade-up relative flex w-full flex-col overflow-y-auto bg-ca-bg">
      {/* ── Hero band ── */}
      <section className="relative overflow-hidden bg-ca-lime">
        {/* Decorative shapes */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
        >
          <div className="shape-circle absolute -right-20 -top-20 h-72 w-72 bg-ca-violet opacity-[0.92]" />
          <div className="shape-circle ca-pulse absolute right-32 top-8 h-12 w-12 bg-ca-ink" />
          <div className="shape-circle absolute -bottom-10 -left-10 h-40 w-40 bg-ca-violet-soft" />
          <div className="shape-circle absolute bottom-6 left-1/3 h-3 w-3 bg-ca-ink" />
          <div className="shape-circle absolute bottom-10 right-1/4 h-4 w-4 bg-white" />
        </div>

        <Confetti count={22} />

        <div className="relative grid items-center gap-8 px-8 py-10 md:px-12 lg:grid-cols-[auto_1fr_auto]">
          {/* Big check icon */}
          <div className="relative">
            <div
              className="shape-circle ca-ring-pulse grid place-items-center"
              style={{
                width: 120,
                height: 120,
                background: "#fff",
                border: "4px solid var(--color-ca-ink)",
              }}
            >
              <div
                className="shape-circle ca-check-pop grid place-items-center bg-ca-lime-deep"
                style={{ width: 88, height: 88 }}
              >
                <Check size={56} strokeWidth={4} className="text-white" />
              </div>
            </div>
            <div className="shape-circle ca-float absolute -right-2 -top-2 grid h-9 w-9 place-items-center bg-ca-violet text-white">
              <Sparkles size={16} strokeWidth={2} />
            </div>
          </div>

          {/* Headline */}
          <div>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]"
              style={{
                background: "var(--color-ca-ink)",
                color: "var(--color-ca-lime)",
              }}
            >
              <Trophy size={11} strokeWidth={2.5} /> Quiz aprobado
            </div>
            <h1 className="mt-3 text-[36px] font-black leading-[0.98] tracking-[-0.035em] text-ca-ink md:text-[44px]">
              ¡Felicitaciones,
              <br />
              <span className="text-ca-violet-deep">{studentName}!</span>
            </h1>
            <p className="mt-3 max-w-md text-[14px] font-semibold leading-relaxed text-ca-ink">
              Aprobaste el quiz final del workshop con un puntaje sobre el
              mínimo requerido.
              {certificateReady
                ? " Tu certificado ejecutivo está listo."
                : " Tu certificado se está generando."}
            </p>
          </div>

          {/* Big score */}
          <div className="text-right">
            <div className="font-mono text-[9.5px] font-black uppercase tracking-[0.22em] text-ca-ink opacity-60">
              Tu puntaje
            </div>
            <div
              className="font-black leading-none tracking-[-0.045em] text-ca-ink"
              style={{ fontSize: 108 }}
            >
              {scorePct}
              <span
                className="text-ca-violet-deep"
                style={{ fontSize: 56 }}
              >
                %
              </span>
            </div>
            <div
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-ca-ink"
            >
              <Check size={11} strokeWidth={3} />
              {surplus > 0 ? `+${surplus} pts sobre el mínimo` : "Justo en el mínimo"}
            </div>
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="relative flex-1 px-8 py-10 md:px-12">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Left column — score detail + certificate */}
          <div className="flex flex-col gap-6">
            {/* Score bar card */}
            <div className="ca-fade-up ca-stagger ca-card p-7" style={{ "--i": 1 } as React.CSSProperties}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ca-ink-soft">
                    Desempeño
                  </div>
                  <h3 className="mt-1 text-[18px] font-extrabold tracking-tight text-ca-ink">
                    {correctCount} de {totalQuestions} respuestas correctas
                  </h3>
                </div>
                <Badge tone="lime" className="px-3 py-1.5 text-[11.5px] uppercase tracking-[0.16em]">
                  <Check size={11} strokeWidth={3} /> Aprobado
                </Badge>
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

            {/* Certificate card */}
            <div className="ca-fade-up ca-stagger ca-card relative overflow-hidden p-7" style={{ "--i": 2 } as React.CSSProperties}>
              <div className="shape-circle absolute -right-10 -top-10 h-32 w-32 bg-ca-lime opacity-35" />
              <div className="shape-circle absolute right-12 top-6 h-3 w-3 bg-ca-violet" />

              <div className="relative flex flex-col items-start gap-5 sm:flex-row">
                {/* Mini cert preview */}
                <div
                  className="relative shrink-0 overflow-hidden bg-white"
                  style={{
                    width: 132,
                    height: 96,
                    borderRadius: 8,
                    border: "1px solid var(--color-ca-outline-strong)",
                    boxShadow: "0 18px 36px rgba(20,22,58,0.10)",
                  }}
                >
                  <div className="shape-circle absolute -right-3 -top-3 h-8 w-8 bg-ca-violet opacity-20" />
                  <div className="shape-circle absolute left-2 top-2 grid h-4 w-4 place-items-center bg-ca-violet">
                    <span
                      className="font-black text-white"
                      style={{ fontSize: 6 }}
                    >
                      CA
                    </span>
                  </div>
                  <div
                    className="absolute left-2 right-2"
                    style={{ top: 28 }}
                  >
                    <div
                      className="font-mono font-bold"
                      style={{
                        fontSize: 5,
                        color: "var(--color-ca-ink-soft)",
                        letterSpacing: "0.18em",
                      }}
                    >
                      CERTIFICADO
                    </div>
                    <div
                      className="mt-0.5 font-black leading-tight tracking-tight"
                      style={{
                        fontSize: 9,
                        color: "var(--color-ca-ink)",
                      }}
                    >
                      {studentName}
                    </div>
                    <div
                      className="mt-1 font-bold leading-tight"
                      style={{
                        fontSize: 5.5,
                        color: "var(--color-ca-violet)",
                      }}
                    >
                      {programTitle}
                    </div>
                  </div>
                  <div className="shape-circle absolute bottom-1 right-1 h-2.5 w-2.5 bg-ca-lime" />
                </div>

                <div className="min-w-0 flex-1">
                  <Badge
                    tone="lime"
                    size="sm"
                    className="ca-check-pop text-[9.5px] uppercase tracking-[0.2em]"
                  >
                    <Check size={10} strokeWidth={3} />
                    {certificateReady
                      ? "Certificado generado"
                      : "Generando certificado…"}
                  </Badge>
                  <h4 className="mt-2 text-[17px] font-extrabold leading-tight tracking-tight text-ca-ink">
                    {programTitle}
                  </h4>
                  {verificationCode && (
                    <div className="mt-1 font-mono text-[11px] font-medium text-ca-ink-soft">
                      Folio {verificationCode}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      onClick={onDownloadCert}
                      disabled={!certificateReady}
                      variant="lime"
                      className="h-11 min-h-0 gap-2 px-5 text-[12.5px] uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Download size={15} strokeWidth={2} />
                      Descargar PDF
                    </Button>
                    <Button
                      onClick={onViewCert}
                      variant="outline"
                      className="h-11 min-h-0 gap-2 px-5 text-[12.5px] uppercase tracking-[0.08em]"
                    >
                      <Eye size={15} strokeWidth={2} />
                      Ver en el classroom
                    </Button>
                    <Button
                      onClick={onShareLinkedIn}
                      variant="outline"
                      className="h-11 min-h-0 gap-2 px-5 text-[12.5px] uppercase tracking-[0.08em]"
                    >
                      <Share2 size={15} strokeWidth={2} />
                      Compartir
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right column — review answers + next step */}
          <div className="ca-fade-up ca-stagger flex flex-col gap-4" style={{ "--i": 2 } as React.CSSProperties}>
            {/* Review card */}
            <div className="ca-card p-6">
              <div className="flex items-center gap-2">
                <div className="shape-circle grid h-9 w-9 place-items-center bg-ca-violet-mist text-ca-violet">
                  <Eye size={16} strokeWidth={2} />
                </div>
                <div>
                  <h4 className="text-[14px] font-extrabold tracking-tight text-ca-ink">
                    Repasa tus respuestas
                  </h4>
                  <div className="text-[11.5px] font-semibold text-ca-ink-soft">
                    {wrongCount} fallada{wrongCount !== 1 ? "s" : ""} · ver
                    explicación
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {correctAnswers.map((a) => (
                  <button
                    key={a.questionId}
                    onClick={onReviewAnswers}
                    className="flex items-center justify-between gap-2 rounded-lg bg-ca-bg px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className="shape-circle grid h-6 w-6 shrink-0 place-items-center text-white"
                        style={{
                          background: a.correct
                            ? "var(--color-ca-lime-deep)"
                            : "var(--color-ca-rose)",
                        }}
                      >
                        {a.correct ? (
                          <Check size={11} strokeWidth={3} />
                        ) : (
                          <svg
                            width={11}
                            height={11}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        )}
                      </div>
                      <span className="truncate text-[12px] font-semibold text-ca-ink">
                        {a.questionText} · {a.topic}
                      </span>
                    </div>
                    <ChevronRight
                      size={14}
                      strokeWidth={2}
                      className="shrink-0 text-ca-ink-soft"
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Next step dark card */}
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
                className="shape-circle absolute -bottom-6 -right-6 h-24 w-24 bg-ca-violet opacity-50"
              />
              <div
                aria-hidden
                className="shape-circle absolute -top-3 right-8 h-6 w-6 bg-ca-lime"
              />

              <div className="relative">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
                  Siguiente paso
                </div>
                <h4 className="mt-1 text-[18px] font-black leading-tight tracking-tight">
                  Continua aprendiendo
                </h4>
                <p className="mt-2 text-[12px] font-medium leading-relaxed text-white/[0.78]">
                  Ya tienes tu certificación de {programTitle}. Explora los
                  siguientes programas disponibles.
                </p>
                <button className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-ca-lime px-4 py-2 text-[11.5px] font-bold uppercase tracking-[0.1em] text-ca-ink">
                  Continuar <ArrowRight size={12} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
