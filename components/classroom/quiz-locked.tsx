"use client";

import Link from "next/link";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type RemainingLesson = {
  title: string;
  module: string;
  duration: string;
  done: boolean;
  current?: boolean;
};

type QuizLockedProps = {
  currentPct: number;
  requiredPct: number;
  completedLessons: number;
  totalLessons: number;
  remainingLessons: RemainingLesson[];
  cohortSlug: string;
  moduleSlug?: string;
};

/* ------------------------------------------------------------------ */
/* Inline SVG icon helper (mirrors CIcon from design prototype)        */
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
    lock: (
      <>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 018 0v4" />
      </>
    ),
    check: <path d="M5 13l4 4L19 7" />,
    play: (
      <path d="M6 4l14 8-14 8V4z" fill="currentColor" stroke="none" />
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7.5v.5" />
      </>
    ),
    chevronRight: <path d="M9 18l6-6-6-6" />,
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

export function QuizLocked({
  currentPct,
  requiredPct,
  completedLessons,
  totalLessons,
  remainingLessons,
  cohortSlug,
  moduleSlug,
}: QuizLockedProps) {
  const pendingLessons = remainingLessons.filter((l) => !l.done);
  const pendingCount = pendingLessons.length;
  const estimatedMinutes = pendingLessons.reduce((acc, l) => {
    const [m, s] = l.duration.split(":").map(Number);
    return acc + (m ?? 0) + (s ? s / 60 : 0);
  }, 0);
  const estimatedLabel = Math.round(estimatedMinutes);

  return (
    <div className="px-8 py-10 md:px-12" style={{ background: "var(--color-ca-bg)" }}>
      {/* Hero card + side info */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* ---- Locked hero card ---- */}
        <div className="ca-card relative overflow-hidden p-8">
          {/* Decorative shapes */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div
              className="shape-circle absolute -right-12 -top-12 h-44 w-44"
              style={{ background: "var(--color-ca-violet)", opacity: 0.05 }}
            />
            <div
              className="shape-half-right absolute -bottom-8 -left-8 h-28 w-28"
              style={{ background: "var(--color-ca-lime)", opacity: 0.5 }}
            />
            <div
              className="shape-circle absolute right-12 top-8 h-2.5 w-2.5"
              style={{ background: "var(--color-ca-violet)" }}
            />
          </div>

          <div className="relative flex items-start gap-6">
            {/* Lock badge */}
            <div
              className="shape-circle relative grid shrink-0 place-items-center"
              style={{ width: 92, height: 92, background: "var(--color-ca-ink)" }}
            >
              <Icon name="lock" size={36} stroke={2} style={{ color: "#fff" }} />
              <div
                className="shape-circle absolute -right-1 -top-1 grid h-6 w-6 place-items-center"
                style={{ background: "var(--color-ca-lime)", color: "var(--color-ca-ink)" }}
              >
                <span className="font-mono text-[9px] font-black">{pendingCount}</span>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              {/* Pill */}
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em]"
                style={{
                  background: "transparent",
                  color: "var(--color-ca-ink)",
                  border: "1px solid var(--color-ca-outline-strong)",
                }}
              >
                <Icon name="lock" size={11} stroke={2.5} />
                Bloqueado
              </span>

              <h2
                className="mt-3 text-[22px] font-black leading-tight tracking-tight"
                style={{ color: "var(--color-ca-ink)" }}
              >
                Completa {pendingCount} lecciones más para desbloquear tu quiz
              </h2>
              <p
                className="mt-2 text-[13.5px] font-medium leading-relaxed"
                style={{ color: "var(--color-ca-ink-soft)" }}
              >
                Para asegurar que el quiz refleje todo lo que aprendiste,
                necesitas avanzar al{" "}
                <strong style={{ color: "var(--color-ca-ink)" }}>{requiredPct}%</strong> del
                workshop. Vas en buen ritmo.
              </p>

              {/* Progress block */}
              <div className="mt-5">
                <div
                  className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: "var(--color-ca-ink-soft)" }}
                >
                  <span>Tu progreso</span>
                  <span>
                    <span style={{ color: "var(--color-ca-ink)" }}>{currentPct}%</span> /{" "}
                    {requiredPct}% requerido
                  </span>
                </div>
                <div
                  className="shape-circle relative mt-2 overflow-hidden"
                  style={{ background: "var(--color-ca-bg-soft)", height: 14 }}
                >
                  <div
                    className="shape-circle h-full"
                    style={{
                      width: `${currentPct}%`,
                      background:
                        "linear-gradient(90deg, var(--color-ca-violet-deep), var(--color-ca-violet))",
                    }}
                  />
                  {/* Required threshold line */}
                  <div
                    className="absolute bottom-0 top-0"
                    style={{
                      left: `${requiredPct}%`,
                      width: 2,
                      background: "var(--color-ca-ink)",
                    }}
                  />
                  <div
                    className="absolute -top-6 font-mono text-[9px] font-bold"
                    style={{
                      left: `calc(${requiredPct}% - 12px)`,
                      color: "var(--color-ca-ink)",
                    }}
                  >
                    {requiredPct}%
                  </div>
                </div>
                <div
                  className="mt-3 flex items-center gap-2 text-[11.5px] font-semibold"
                  style={{ color: "var(--color-ca-ink-soft)" }}
                >
                  <Icon name="info" size={12} stroke={1.8} />
                  Equivale a{" "}
                  <strong style={{ color: "var(--color-ca-ink)" }}>
                    {pendingCount} lecciones
                  </strong>{" "}
                  más · estimadas en{" "}
                  <strong style={{ color: "var(--color-ca-ink)" }}>
                    {estimatedLabel} minutos
                  </strong>
                  .
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <Link
                  href={moduleSlug ? `/classroom/${cohortSlug}/${moduleSlug}` : `/classroom/${cohortSlug}`}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.08em]"
                  style={{
                    background: "var(--color-ca-ink)",
                    color: "#fff",
                    border: "1px solid var(--color-ca-ink)",
                  }}
                >
                  <Icon name="play" size={15} stroke={2} />
                  Continuar viendo
                </Link>
                <Link
                  href={`/classroom/${cohortSlug}`}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.08em]"
                  style={{
                    background: "transparent",
                    color: "var(--color-ca-ink)",
                    border: "1px solid var(--color-ca-outline-strong)",
                  }}
                >
                  Ver workshop completo
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Side: what the quiz unlocks ---- */}
        <div className="ca-card relative overflow-hidden p-7">
          <div
            aria-hidden
            className="shape-circle absolute -right-4 -top-4 h-20 w-20"
            style={{ background: "var(--color-ca-violet-soft)", opacity: 0.7 }}
          />
          <div className="relative">
            <div
              className="font-mono text-[10px] font-bold uppercase tracking-[0.22em]"
              style={{ color: "var(--color-ca-ink-soft)" }}
            >
              El quiz incluye
            </div>
            <h3
              className="mt-1 text-[17px] font-extrabold tracking-tight"
              style={{ color: "var(--color-ca-ink)" }}
            >
              Lo que necesitas saber
            </h3>
            <ul className="mt-4 flex flex-col gap-3">
              {[
                ["10 preguntas", "Aleatorias del contenido de tus lecciones"],
                ["70% para aprobar", "7 de 10 respuestas correctas"],
                ["3 intentos disponibles", "Para que no haya presión innecesaria"],
                ["Certificado al aprobar", "PDF firmado, verificable y compartible"],
              ].map(([title, sub]) => (
                <li key={title} className="flex items-start gap-3">
                  <div
                    className="shape-circle mt-0.5 grid h-5 w-5 shrink-0 place-items-center"
                    style={{
                      background: "var(--color-ca-violet-mist)",
                      color: "var(--color-ca-violet)",
                    }}
                  >
                    <Icon name="check" size={11} stroke={3} />
                  </div>
                  <div>
                    <div
                      className="text-[12.5px] font-extrabold tracking-tight"
                      style={{ color: "var(--color-ca-ink)" }}
                    >
                      {title}
                    </div>
                    <div
                      className="text-[11.5px] font-medium"
                      style={{ color: "var(--color-ca-ink-soft)" }}
                    >
                      {sub}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ---- Pending lessons list ---- */}
      {remainingLessons.length > 0 && (
      <div className="ca-card mt-6 overflow-hidden">
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--color-ca-outline)" }}
        >
          <div>
            <h3
              className="text-[15px] font-extrabold tracking-tight"
              style={{ color: "var(--color-ca-ink)" }}
            >
              Tu camino al quiz
            </h3>
            <div
              className="text-[11.5px] font-semibold"
              style={{ color: "var(--color-ca-ink-soft)" }}
            >
              {totalLessons} lecciones · {completedLessons} completadas ·{" "}
              {totalLessons - completedLessons} pendientes
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em]"
            style={{
              background: "var(--color-ca-violet-mist)",
              color: "var(--color-ca-violet-deep)",
            }}
          >
            <Icon name="clock" size={11} stroke={2.5} />
            {estimatedLabel} min restantes
          </span>
        </div>

        <ul>
          {remainingLessons.map((l, i) => (
            <li
              key={i}
              className="flex items-center gap-4 border-b px-6 py-3.5 last:border-b-0"
              style={{
                borderColor: "var(--color-ca-outline)",
                background: l.current ? "var(--color-ca-violet-mist)" : "transparent",
              }}
            >
              {/* Status dot */}
              <div
                className="shape-circle grid h-7 w-7 shrink-0 place-items-center"
                style={{
                  background: l.done
                    ? "var(--color-ca-lime-deep)"
                    : l.current
                      ? "var(--color-ca-violet)"
                      : "transparent",
                  border:
                    l.done || l.current
                      ? "none"
                      : "1.5px solid var(--color-ca-outline-strong)",
                  color: "#fff",
                }}
              >
                {l.done ? (
                  <Icon name="check" size={13} stroke={3} />
                ) : l.current ? (
                  <Icon name="play" size={11} />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div
                  className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: "var(--color-ca-ink-soft)" }}
                >
                  {l.module}
                  {l.current && (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.16em]"
                      style={{
                        background: "var(--color-ca-violet-mist)",
                        color: "var(--color-ca-violet-deep)",
                      }}
                    >
                      En progreso
                    </span>
                  )}
                </div>
                <div
                  className="text-[13px] font-bold tracking-tight"
                  style={{
                    color: l.done ? "var(--color-ca-ink-soft)" : "var(--color-ca-ink)",
                    textDecoration: l.done ? "line-through" : "none",
                  }}
                >
                  {l.title}
                </div>
              </div>

              <div
                className="font-mono text-[11px] font-bold"
                style={{ color: "var(--color-ca-ink-soft)" }}
              >
                {l.duration}
              </div>

              {!l.done && (
                <button
                  className="shape-circle grid h-8 w-8 place-items-center"
                  style={{
                    background: l.current
                      ? "var(--color-ca-violet)"
                      : "var(--color-ca-bg-soft)",
                    color: l.current ? "#fff" : "var(--color-ca-ink)",
                  }}
                >
                  <Icon name="arrowRight" size={14} stroke={2} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      )}
    </div>
  );
}
