"use client";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type QuizStartProps = {
  programTitle: string;
  questionsPerAttempt: number;
  passingGradePct: number;
  maxAttempts: number;
  attemptsUsed: number;
  lastScore?: number;
  timeLimitMinutes?: number;
  onStart: () => void;
  onBack: () => void;
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
    trophy: (
      <>
        <path d="M8 21h8M12 17v4M5 4h14v3a7 7 0 01-14 0V4z" />
        <path d="M5 6H3a2 2 0 002 2M19 6h2a2 2 0 01-2 2" />
      </>
    ),
    helpCircle: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4M12 17v.5" />
      </>
    ),
    refresh: (
      <>
        <path d="M21 12a9 9 0 11-3-6.7L21 8" />
        <path d="M21 3v5h-5" />
      </>
    ),
    alert: (
      <>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <path d="M12 9v4M12 17v.5" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7.5v.5" />
      </>
    ),
    book: (
      <>
        <path d="M4 4h12a3 3 0 013 3v13H7a3 3 0 01-3-3V4z" />
        <path d="M4 17a3 3 0 013-3h12" />
      </>
    ),
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
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function QuizStart({
  programTitle,
  questionsPerAttempt,
  passingGradePct,
  maxAttempts,
  attemptsUsed,
  lastScore,
  timeLimitMinutes,
  onStart,
  onBack,
}: QuizStartProps) {
  const currentAttempt = attemptsUsed + 1;
  const attemptsRemaining = maxAttempts - attemptsUsed;
  const isRetry = attemptsUsed > 0;
  const correctNeeded = Math.ceil((passingGradePct / 100) * questionsPerAttempt);

  const rules = [
    {
      icon: "helpCircle" as const,
      n: String(questionsPerAttempt),
      label: "preguntas",
      sub: "aleatorias del workshop",
    },
    {
      icon: "trophy" as const,
      n: `${passingGradePct}%`,
      label: "para aprobar",
      sub: `${correctNeeded} correctas de ${questionsPerAttempt}`,
    },
    {
      icon: "refresh" as const,
      n: `${currentAttempt}/${maxAttempts}`,
      label: "intentos",
      sub: isRetry ? `te quedan ${attemptsRemaining}` : "antes de bloquearse",
    },
  ];

  return (
    <div className="relative h-full overflow-y-auto" style={{ background: "var(--color-ca-bg)" }}>
      {/* Decorative band */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden">
        <div
          className="shape-circle absolute -right-16 -top-12 h-56 w-56"
          style={{ background: "var(--color-ca-violet)", opacity: 0.06 }}
        />
        <div
          className="shape-circle absolute top-8 h-4 w-4"
          style={{ right: "25%", background: "var(--color-ca-lime)" }}
        />
        <div
          className="shape-circle absolute top-16 h-2 w-2"
          style={{ left: "25%", background: "var(--color-ca-violet)" }}
        />
      </div>

      <div className="ca-fade-up relative mx-auto max-w-[820px] px-10 py-14">
        {/* Eyebrow pill */}
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em]"
          style={{
            background: "var(--color-ca-violet-mist)",
            color: "var(--color-ca-violet-deep)",
          }}
        >
          <Icon name="trophy" size={11} stroke={2.5} />
          Quiz final · desbloqueado
        </span>

        <h1
          className="mt-4 text-[44px] font-black leading-[1] tracking-[-0.03em]"
          style={{ color: "var(--color-ca-ink)" }}
        >
          Estás listo para certificarte.
        </h1>
        <p
          className="mt-3 max-w-xl text-[15px] font-medium leading-relaxed"
          style={{ color: "var(--color-ca-ink-soft)" }}
        >
          Workshop{" "}
          <strong style={{ color: "var(--color-ca-ink)" }}>{programTitle}</strong>.
          Responde {questionsPerAttempt} preguntas para validar lo que aprendiste.
        </p>

        {/* Rules card */}
        <div className="ca-card relative mt-8 overflow-hidden p-8">
          <div
            aria-hidden
            className="shape-circle absolute -bottom-10 -right-10 h-32 w-32"
            style={{ background: "var(--color-ca-lime)", opacity: 0.35 }}
          />

          <div className="relative grid gap-4 sm:grid-cols-3">
            {rules.map((r, i) => (
              <div
                key={r.label}
                className="ca-fade-up ca-stagger rounded-2xl p-4"
                style={{ background: "var(--color-ca-bg)", "--i": i + 1 } as React.CSSProperties}
              >
                <div
                  className="shape-circle grid h-9 w-9 place-items-center"
                  style={{ background: "var(--color-ca-violet)", color: "#fff" }}
                >
                  <Icon name={r.icon} size={16} stroke={2} />
                </div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <div
                    className="font-black tracking-[-0.03em]"
                    style={{ fontSize: 30, color: "var(--color-ca-ink)" }}
                  >
                    {r.n}
                  </div>
                  <div
                    className="text-[12px] font-bold tracking-tight"
                    style={{ color: "var(--color-ca-ink)" }}
                  >
                    {r.label}
                  </div>
                </div>
                <div
                  className="text-[11.5px] font-semibold"
                  style={{ color: "var(--color-ca-ink-soft)" }}
                >
                  {r.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Retry banner */}
          {isRetry && lastScore != null && (
            <div
              className="relative mt-5 flex items-center gap-3 rounded-2xl p-4"
              style={{ background: "#fff7e6", border: "1px dashed #f5a524" }}
            >
              <div
                className="shape-circle grid h-8 w-8 shrink-0 place-items-center"
                style={{ background: "var(--color-ca-amber)", color: "#fff" }}
              >
                <Icon name="alert" size={14} stroke={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[12.5px] font-extrabold tracking-tight"
                  style={{ color: "var(--color-ca-ink)" }}
                >
                  Intento {currentAttempt} de {maxAttempts} · sacaste {lastScore}% la
                  última vez
                </div>
                <div
                  className="text-[11.5px] font-semibold"
                  style={{ color: "var(--color-ca-ink-soft)" }}
                >
                  Revisa las lecciones antes de empezar.
                </div>
              </div>
              <button
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11.5px] font-bold uppercase tracking-[0.08em]"
                style={{
                  background: "transparent",
                  color: "var(--color-ca-ink)",
                  border: "1px solid var(--color-ca-outline-strong)",
                }}
              >
                <Icon name="book" size={15} stroke={2} />
                Repasar
              </button>
            </div>
          )}

          {/* Note */}
          <div
            className="mt-5 flex items-start gap-2 text-[11.5px] font-medium leading-relaxed"
            style={{ color: "var(--color-ca-ink-soft)" }}
          >
            <Icon name="info" size={14} stroke={1.8} className="mt-0.5 shrink-0" />
            Las preguntas son aleatorias y se sacan del contenido de tus lecciones. Si
            interrumpes el quiz, tu progreso se guarda automáticamente.
            {timeLimitMinutes
              ? ` Tienes ${timeLimitMinutes} minutos para completarlo.`
              : " No hay tiempo límite por pregunta."}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8 flex items-center justify-between gap-4">
          <button
            onClick={onBack}
            className="ca-btn-interactive inline-flex items-center gap-2 rounded-full px-6 text-[13px] font-bold uppercase tracking-[0.08em]"
            style={{
              height: 52,
              background: "transparent",
              color: "var(--color-ca-ink)",
              border: "1px solid var(--color-ca-outline-strong)",
            }}
          >
            <Icon name="arrowLeft" size={18} stroke={2} />
            Volver al workshop
          </button>
          <button
            onClick={onStart}
            className="ca-btn-interactive ca-btn-lime inline-flex items-center gap-2 rounded-full px-7 text-[14px] font-bold uppercase tracking-[0.08em]"
            style={{ height: 56 }}
          >
            Comenzar quiz
            <Icon name="arrowRight" size={18} stroke={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
