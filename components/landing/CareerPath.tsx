import { PROGRAMS_LIST } from "@/lib/landing/programs";
import { ProgramGlyph } from "./ProgramGlyph";

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

        {/* Timeline */}
        <div className="relative mt-16">
          {/* Línea continua que une los 3 hitos — desktop */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 top-[44px] hidden h-px lg:block"
          >
            <div className="mx-[16.66%] h-full bg-gradient-to-r from-transparent via-[var(--color-ca-lime)]/50 to-transparent" />
          </div>

          <ol className="grid gap-6 lg:grid-cols-3 lg:gap-8">
            {PROGRAMS_LIST.map((p, idx) => (
              <li
                key={p.id}
                className="group relative flex flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-ca-lime)]/40 hover:bg-white/[0.07] hover:shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:p-7"
              >
                {/* Hito: glyph + número, centrados sobre la línea */}
                <div className="flex items-center gap-4">
                  <span className="relative flex h-[88px] w-[88px] shrink-0 items-center justify-center">
                    {/* Anillo exterior lime sutil */}
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-[var(--color-ca-lime)]/15 blur-md transition-opacity duration-300 group-hover:opacity-100 lg:opacity-0 group-hover:lg:opacity-100"
                    />
                    {/* Anillo de hito */}
                    <span
                      aria-hidden
                      className="absolute inset-1.5 rounded-full ring-1 ring-inset ring-white/15"
                    />
                    {/* Disco blanco con glyph */}
                    <span className="relative flex h-[68px] w-[68px] items-center justify-center rounded-full bg-white shadow-[0_10px_30px_rgba(0,0,0,0.35),inset_0_-2px_4px_rgba(20,22,58,0.08)]">
                      <ProgramGlyph program={p.id} className="h-9 w-9" />
                    </span>
                  </span>
                  <span className="font-black leading-none tracking-[-0.03em] text-[var(--color-ca-lime)] text-[44px] sm:text-5xl">
                    0{idx + 1}
                  </span>
                </div>

                <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.22em] text-white/55">
                  Etapa {idx + 1} · {p.level}
                </p>
                <h3 className="mt-2 text-xl font-bold leading-tight text-white">
                  {p.shortTitle}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">
                  {p.subtitle}
                </p>

                <div className="mt-auto pt-5">
                  <a
                    href={p.href}
                    className="inline-flex w-fit items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-ca-lime)] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-lime)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--color-ca-navy)]"
                  >
                    Ver programa
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
