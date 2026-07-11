"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type QuizQuestion = {
  id: string;
  question_text: string;
  options: Record<string, string>;
};

type QuizInProgressProps = {
  programTitle: string;
  questions: QuizQuestion[];
  timeLimitMinutes?: number;
  attempt: number;
  maxAttempts: number;
  onSubmit: (answers: Record<string, string>) => void;
  onExit: () => void;
};

/* ------------------------------------------------------------------ */
/* Inline SVG icon helper                                              */
/* ------------------------------------------------------------------ */

function Icon({
  name,
  size = 18,
  stroke = 1.5,
  className = "",
  style,
}: {
  name: string;
  size?: number;
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const s: React.CSSProperties = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...style,
  };

  const paths: Record<string, React.ReactNode> = {
    check: <path d="M5 13l4 4L19 7" />,
    x: <path d="M18 6L6 18M6 6l12 12" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    refresh: (
      <>
        <path d="M21 12a9 9 0 11-3-6.7L21 8" />
        <path d="M21 3v5h-5" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7.5v.5" />
      </>
    ),
    flag: (
      <>
        <path d="M4 21V4M4 4h14l-3 5 3 5H4" />
      </>
    ),
    bookmark: <path d="M5 3h14v18l-7-4-7 4V3z" />,
    arrowLeft: <path d="M19 12H5M12 19l-7-7 7-7" />,
    arrowRight: <path d="M5 12h14M12 5l7 7-7 7" />,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={s}
      className={className}
    >
      {paths[name] ?? null}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmtTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function ProgressDots({
  total,
  currentIdx,
  answeredSet,
  onDotClick,
}: {
  total: number;
  currentIdx: number;
  answeredSet: Set<number>;
  onDotClick: (idx: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => {
        const isCurrent = i === currentIdx;
        const isAnswered = answeredSet.has(i);
        return (
          <button
            key={i}
            onClick={() => onDotClick(i)}
            className="grid place-items-center"
            style={{ width: 22, height: 22 }}
            aria-label={`Pregunta ${i + 1}`}
          >
            {isCurrent ? (
              <div
                className="shape-circle grid place-items-center"
                style={{
                  width: 22,
                  height: 22,
                  border: "2px solid var(--color-ca-violet)",
                }}
              >
                <div
                  className="shape-circle"
                  style={{
                    width: 8,
                    height: 8,
                    background: "var(--color-ca-violet)",
                  }}
                />
              </div>
            ) : isAnswered ? (
              <div
                className="shape-circle"
                style={{
                  width: 14,
                  height: 14,
                  background: "var(--color-ca-violet)",
                }}
              />
            ) : (
              <div
                className="shape-circle"
                style={{
                  width: 10,
                  height: 10,
                  background: "var(--color-ca-outline-strong)",
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

function QuizOption({
  letter,
  text,
  isSelected,
  onSelect,
}: {
  letter: string;
  text: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`quiz-option group relative flex w-full items-start gap-4 px-5 py-4 text-left ${isSelected ? "is-selected" : ""}`}
    >
      <div
        className="shape-circle grid h-9 w-9 shrink-0 place-items-center text-[14px] font-black"
        style={{
          background: isSelected ? "rgba(255,255,255,0.18)" : "var(--color-ca-bg-soft)",
          color: isSelected ? "#fff" : "var(--color-ca-ink)",
          border: isSelected
            ? "1px solid rgba(255,255,255,0.3)"
            : "1px solid var(--color-ca-outline)",
        }}
      >
        {letter.toUpperCase()}
      </div>
      <div
        className="flex-1 pt-1.5 text-[14px] font-medium leading-relaxed"
        style={{ color: isSelected ? "#fff" : "var(--color-ca-ink)" }}
      >
        {text}
      </div>
      {isSelected && (
        <div
          className="shape-circle ca-check-pop grid h-7 w-7 shrink-0 place-items-center"
          style={{ background: "var(--color-ca-lime)", color: "var(--color-ca-ink)" }}
        >
          <Icon name="check" size={14} stroke={3} />
        </div>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export function QuizInProgress({
  programTitle,
  questions,
  timeLimitMinutes,
  attempt,
  maxAttempts,
  onSubmit,
  onExit,
}: QuizInProgressProps) {
  const total = questions.length;

  /* State */
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(
    timeLimitMinutes != null ? timeLimitMinutes * 60 : null,
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  /* Timer */
  useEffect(() => {
    if (timeLeft == null) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev == null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft == null]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Auto-submit when timer runs out */
  useEffect(() => {
    if (timeLeft === 0) {
      onSubmit(answersRef.current);
    }
  }, [timeLeft, onSubmit]);

  const currentQ = questions[currentIdx];
  const optionEntries = Object.entries(currentQ.options);
  const selectedLetter = answers[currentQ.id] ?? null;

  const answeredSet = useMemo(
    () =>
      new Set(
        questions
          .map((q, i) => (answers[q.id] != null ? i : -1))
          .filter((i) => i >= 0),
      ),
    [answers, questions],
  );

  const pct = ((currentIdx + 1) / total) * 100;
  const isLast = currentIdx === total - 1;
  const isFirst = currentIdx === 0;

  /* Navigation */
  const goNext = useCallback(() => {
    if (isLast) {
      onSubmit(answers);
    } else {
      setCurrentIdx((p) => Math.min(p + 1, total - 1));
    }
  }, [isLast, answers, onSubmit, total]);

  const goPrev = useCallback(() => {
    setCurrentIdx((p) => Math.max(p - 1, 0));
  }, []);

  const selectOption = useCallback(
    (letter: string) => {
      setAnswers((prev) => ({ ...prev, [currentQ.id]: letter }));
    },
    [currentQ.id],
  );

  /* Keyboard navigation */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        const currentLetterIdx = optionEntries.findIndex(
          ([k]) => k === selectedLetter,
        );
        const nextIdx = currentLetterIdx < optionEntries.length - 1 ? currentLetterIdx + 1 : 0;
        selectOption(optionEntries[nextIdx][0]);
        e.preventDefault();
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        const currentLetterIdx = optionEntries.findIndex(
          ([k]) => k === selectedLetter,
        );
        const prevIdx = currentLetterIdx > 0 ? currentLetterIdx - 1 : optionEntries.length - 1;
        selectOption(optionEntries[prevIdx][0]);
        e.preventDefault();
      } else if (e.key === "Enter" && selectedLetter) {
        goNext();
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedLetter, optionEntries, selectOption, goNext]);

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-ca-bg)" }}>
      {/* ---- Top chrome ---- */}
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-4 md:px-8"
        style={{
          background: "var(--color-ca-surface)",
          borderColor: "var(--color-ca-outline)",
        }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={onExit}
            className="shape-circle grid h-9 w-9 place-items-center"
            style={{
              background: "var(--color-ca-bg-soft)",
              color: "var(--color-ca-ink)",
            }}
            aria-label="Salir del quiz"
          >
            <Icon name="x" size={16} stroke={2} />
          </button>
          <div className="leading-tight">
            <div
              className="font-mono text-[10px] font-bold uppercase tracking-[0.22em]"
              style={{ color: "var(--color-ca-ink-soft)" }}
            >
              Quiz final
            </div>
            <div
              className="text-[14px] font-extrabold tracking-tight"
              style={{ color: "var(--color-ca-ink)" }}
            >
              {programTitle}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Attempt pill */}
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em]"
            style={{
              background: "transparent",
              color: "var(--color-ca-ink)",
              border: "1px solid var(--color-ca-outline-strong)",
            }}
          >
            <Icon name="refresh" size={11} stroke={2.5} />
            Intento {attempt} / {maxAttempts}
          </span>

          {/* Timer */}
          {timeLeft != null && (
            <div
              className="flex items-center gap-2 rounded-full px-4 py-2"
              style={{ background: "var(--color-ca-ink)", color: "#fff" }}
            >
              <Icon name="clock" size={14} stroke={2} />
              <span className="font-mono text-[13px] font-bold tracking-wide">
                {fmtTime(timeLeft)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ---- Progress bar ---- */}
      <div className="relative" style={{ background: "var(--color-ca-bg-soft)", height: 6 }}>
        <div
          className="quiz-progress-fill h-full"
          style={{ width: `${pct}%`, transition: "width 320ms ease" }}
        />
        <div
          className="shape-circle ca-pulse absolute top-1/2 -translate-y-1/2"
          style={{
            left: `calc(${pct}% - 8px)`,
            width: 16,
            height: 16,
            background: "var(--color-ca-lime)",
            border: "2px solid #fff",
          }}
        />
      </div>

      {/* ---- Body ---- */}
      <div className="relative flex-1 overflow-hidden">
        {/* Decorative brand shapes */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="shape-circle absolute -left-24 top-12 h-48 w-48"
            style={{ background: "var(--color-ca-violet)", opacity: 0.04 }}
          />
          <div
            className="shape-circle absolute -bottom-16 right-12 h-40 w-40"
            style={{ background: "var(--color-ca-lime)", opacity: 0.18 }}
          />
          <div
            className="shape-circle absolute right-32 top-10 h-3 w-3"
            style={{ background: "var(--color-ca-violet)" }}
          />
        </div>

        <div className="relative mx-auto flex h-full max-w-[820px] flex-col px-4 py-6 md:px-8 md:py-10">
          {/* Question header + question text + options — re-mount on index change to animate */}
          <div
            key={currentIdx}
            className="ca-fade-up flex flex-col"
            style={{ animationDuration: "var(--dur-base)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="font-mono font-black leading-none tracking-tight tabular-nums"
                  style={{ fontSize: 44, color: "var(--color-ca-ink)" }}
                >
                  {pad2(currentIdx + 1)}
                  <span
                    className="text-[20px]"
                    style={{ color: "var(--color-ca-ink-soft)" }}
                  >
                    /{pad2(total)}
                  </span>
                </div>
                <div
                  className="h-10 w-px"
                  style={{ background: "var(--color-ca-outline)" }}
                />
                <Badge tone="violet" className="uppercase tracking-[0.16em]">
                  <Icon name="bookmark" size={11} stroke={2.5} />
                  Pregunta {currentIdx + 1}
                </Badge>
              </div>
            </div>

            {/* Question text */}
            <h2
              className="mt-6 text-[22px] font-extrabold leading-snug tracking-tight"
              style={{ color: "var(--color-ca-ink)" }}
            >
              {currentQ.question_text}
            </h2>

            {/* Options */}
            <div className="mt-6 flex flex-col gap-2.5">
              {optionEntries.map(([letter, text]) => (
                <QuizOption
                  key={letter}
                  letter={letter}
                  text={text}
                  isSelected={selectedLetter === letter}
                  onSelect={() => selectOption(letter)}
                />
              ))}
            </div>
          </div>

          <div className="flex-1" />

          {/* Footer nav */}
          <div
            className="mt-6 flex items-center justify-between gap-4 border-t pt-5"
            style={{ borderColor: "var(--color-ca-outline)" }}
          >
            <Button
              onClick={goPrev}
              disabled={isFirst}
              variant="outline"
              className="h-auto min-h-0 gap-2 px-5 py-2.5 text-[12.5px] uppercase tracking-[0.08em]"
            >
              <Icon name="arrowLeft" size={15} stroke={2} />
              Anterior
            </Button>

            <ProgressDots
              total={total}
              currentIdx={currentIdx}
              answeredSet={answeredSet}
              onDotClick={setCurrentIdx}
            />

            <Button
              onClick={goNext}
              disabled={!selectedLetter}
              variant="lime"
              className="h-auto min-h-0 gap-2 px-5 py-2.5 text-[12.5px] uppercase tracking-[0.08em]"
            >
              {isLast ? "Enviar respuestas" : "Siguiente"}
              <Icon name="arrowRight" size={15} stroke={2} />
            </Button>
          </div>

          {/* Bottom hint */}
          <div
            className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium"
            style={{ color: "var(--color-ca-ink-soft)" }}
          >
            <Icon name="info" size={12} stroke={1.8} />
            Tu progreso se guarda automáticamente. Puedes pausar y retomar.
          </div>
        </div>
      </div>
    </div>
  );
}
