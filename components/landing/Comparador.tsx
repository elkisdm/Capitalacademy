import { PROGRAMS_LIST, themeStyles } from "@/lib/landing/programs";
import { ProgramGlyph } from "./ProgramGlyph";

const rows = [
  { label: "Para quién", key: "audienceTags" as const },
  { label: "Nivel", key: "level" as const },
  { label: "Duración", key: "duration" as const },
  { label: "Módulos", key: "modulesText" as const },
  { label: "Modalidad", key: "modality" as const },
  { label: "Áreas que cubre", key: "areas" as const },
  { label: "Próxima cohorte", key: "nextStart" as const },
];

export function Comparador() {
  return (
    <section
      id="comparar"
      className="relative overflow-hidden bg-[var(--color-ca-bg)] py-24 sm:py-28"
    >
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-violet)]">
            Comparador
          </p>
          <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
            ¿Cuál programa es{" "}
            <span className="text-[var(--color-ca-violet)]">para ti</span>?
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-lg">
            Compara las tres rutas formativas en una sola vista y elige la que
            mejor se ajusta a tu etapa profesional.
          </p>
        </div>

        {/* Desktop: tabla; Mobile: stack de cards */}
        <div className="mt-14 overflow-hidden rounded-[1.75rem] border border-[rgba(20,22,58,0.08)] bg-white shadow-[0_18px_40px_rgba(20,22,58,0.06)]">
          {/* Header row */}
          <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_1fr_1fr]">
            <div className="hidden border-b border-[rgba(20,22,58,0.08)] bg-[var(--color-ca-bg)] px-5 py-5 lg:block" />
            {PROGRAMS_LIST.map((p) => {
              const t = themeStyles[p.theme];
              return (
                <div
                  key={p.id}
                  className="border-b border-[rgba(20,22,58,0.08)] px-5 py-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-ca-bg)]">
                      <ProgramGlyph program={p.id} className="h-6 w-6" />
                    </span>
                    <div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] ${t.badge}`}
                      >
                        {p.tag}
                      </span>
                      <p className="mt-1 text-sm font-bold leading-tight text-[var(--color-ca-ink)]">
                        {p.shortTitle}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Filas */}
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-1 border-b border-[rgba(20,22,58,0.06)] last:border-b-0 lg:grid-cols-[200px_1fr_1fr_1fr]"
            >
              <div className="bg-[var(--color-ca-bg)] px-5 py-4 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ca-ink-soft)] lg:py-5">
                {row.label}
              </div>
              {PROGRAMS_LIST.map((p) => {
                let value: React.ReactNode;
                if (row.key === "modulesText") {
                  value = `${p.modules} módulos`;
                } else if (row.key === "audienceTags" || row.key === "areas") {
                  const t = themeStyles[p.theme];
                  value = (
                    <ul className="flex flex-wrap gap-1.5">
                      {p[row.key].map((tag) => (
                        <li
                          key={tag}
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${t.chip}`}
                        >
                          {tag}
                        </li>
                      ))}
                    </ul>
                  );
                } else {
                  value = p[row.key];
                }
                return (
                  <div
                    key={p.id}
                    className="border-t border-[rgba(20,22,58,0.06)] px-5 py-4 text-sm text-[var(--color-ca-ink)] lg:border-t-0 lg:py-5"
                  >
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ca-violet)] lg:hidden">
                      {p.shortTitle}
                    </span>
                    {value}
                  </div>
                );
              })}
            </div>
          ))}

          {/* CTAs */}
          <div className="grid grid-cols-1 border-t border-[rgba(20,22,58,0.08)] bg-[var(--color-ca-bg)] lg:grid-cols-[200px_1fr_1fr_1fr]">
            <div className="hidden lg:block" />
            {PROGRAMS_LIST.map((p) => (
              <div key={p.id} className="px-5 py-5">
                <a
                  href={p.href}
                  className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-5 text-xs font-bold uppercase tracking-[0.16em] text-white transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2"
                >
                  Ver {p.tag}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
