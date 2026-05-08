import { PROGRAMS_LIST } from "@/lib/landing/programs";
import { ProgramGlyph } from "./ProgramGlyph";

/**
 * Trayectoria visual — replica el patrón "punto + línea ondulante + círculo"
 * del Manual Gráfico oficial. Conecta los 3 programas como una carrera continua.
 */
export function CareerPath() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-ca-navy)] py-24 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-24 h-[420px] w-[420px] brand-circle-violet opacity-40 blur-3xl"
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-end">
          <div>
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-lime)]">
              Trayectoria Capital Academy
            </p>
            <h2 className="text-4xl font-black leading-[1.02] tracking-[-0.03em] text-white sm:text-5xl md:text-6xl">
              Tu carrera no termina.{" "}
              <span className="text-[var(--color-ca-lime)]">
                Continúa y se potencia.
              </span>
            </h2>
          </div>
          <p className="text-base leading-relaxed text-white/80 sm:text-lg">
            Cada programa es una etapa. Puedes entrar por donde estés hoy y
            avanzar a tu ritmo. Lo que aprendes en uno se acumula y te prepara
            para el siguiente.
          </p>
        </div>

        {/* Timeline horizontal en desktop, vertical en mobile */}
        <ol className="mt-16 grid gap-6 lg:grid-cols-3 lg:gap-0">
          {PROGRAMS_LIST.map((p, idx) => (
            <li
              key={p.id}
              className="relative flex flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm transition-all hover:border-[var(--color-ca-lime)]/40 hover:bg-white/[0.07] lg:rounded-none lg:border-0 lg:bg-transparent lg:px-8"
            >
              {/* Conector horizontal entre items en desktop */}
              {idx < PROGRAMS_LIST.length - 1 && (
                <span
                  aria-hidden
                  className="hidden lg:absolute lg:right-0 lg:top-7 lg:block lg:h-px lg:w-full lg:bg-gradient-to-r lg:from-[var(--color-ca-lime)]/60 lg:to-transparent"
                />
              )}

              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
                  <ProgramGlyph program={p.id} className="h-8 w-8" />
                </span>
                <span className="text-5xl font-black leading-none text-[var(--color-ca-lime)]">
                  0{idx + 1}
                </span>
              </div>

              <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/60">
                Etapa {idx + 1} · {p.level}
              </p>
              <h3 className="mt-2 text-xl font-bold leading-tight text-white">
                {p.shortTitle}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                {p.subtitle}
              </p>
              <a
                href={p.href}
                className="mt-5 inline-flex w-fit items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-ca-lime)] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-lime)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--color-ca-navy)]"
              >
                Ver programa
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
