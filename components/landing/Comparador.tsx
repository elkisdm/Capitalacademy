import { PROGRAMS_LIST, themeStyles } from "@/lib/landing/programs";
import { ProgramGlyph } from "./ProgramGlyph";

const FEATURED_ID = "diplomado";

const RowIcons = {
  audience: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  level: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M3 18l6-6 4 4 8-8" />
      <path d="M14 8h7v7" />
    </svg>
  ),
  duration: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  modules: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  modality: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
  areas: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2l2.39 4.84L20 7.66l-4 3.91.94 5.5L12 14.5l-4.94 2.57L8 11.57l-4-3.91 5.61-.82z" />
    </svg>
  ),
  cohort: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
};

type RowKey =
  | "audienceTags"
  | "level"
  | "duration"
  | "modulesText"
  | "modality"
  | "areas"
  | "nextStart";

const rows: { label: string; key: RowKey; icon: React.ReactNode }[] = [
  { label: "Para quién", key: "audienceTags", icon: RowIcons.audience },
  { label: "Nivel", key: "level", icon: RowIcons.level },
  { label: "Duración", key: "duration", icon: RowIcons.duration },
  { label: "Módulos", key: "modulesText", icon: RowIcons.modules },
  { label: "Modalidad", key: "modality", icon: RowIcons.modality },
  { label: "Áreas que cubre", key: "areas", icon: RowIcons.areas },
  { label: "Próxima cohorte", key: "nextStart", icon: RowIcons.cohort },
];

export function Comparador() {
  return (
    <section
      id="comparar"
      className="relative bg-[var(--color-ca-bg)] py-24 sm:py-28"
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

        {/* ============ DESKTOP ============ */}
        <div className="mt-14 hidden lg:block">
          <div className="grid grid-cols-[180px_1fr_1fr_1fr] xl:grid-cols-[220px_1fr_1fr_1fr] gap-4">
            {/* Header column (label gutter) */}
            <div />

            {/* Header cards — 3 programas */}
            {PROGRAMS_LIST.map((p) => {
              const t = themeStyles[p.theme];
              const isFeatured = p.id === FEATURED_ID;
              return (
                <div
                  key={p.id}
                  className={`group relative rounded-3xl border bg-white p-6 transition-all ${
                    isFeatured
                      ? "border-[var(--color-ca-violet)]/30 bg-gradient-to-b from-[var(--color-ca-violet)]/[0.05] to-white shadow-[0_24px_56px_rgba(94,23,235,0.18)]"
                      : "border-[rgba(20,22,58,0.08)] shadow-[0_18px_40px_rgba(20,22,58,0.06)]"
                  }`}
                >
                  {isFeatured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--color-ca-violet)] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.22em] text-white shadow-[0_8px_20px_rgba(94,23,235,0.4)]">
                      Más elegido
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-ca-bg)]">
                      <ProgramGlyph program={p.id} className="h-7 w-7" />
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-[0.22em] ${t.badge}`}
                    >
                      {p.tag}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-black leading-tight tracking-[-0.01em] text-[var(--color-ca-ink)]">
                    {p.shortTitle}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--color-ca-ink-soft)]">
                    {p.subtitle}
                  </p>
                </div>
              );
            })}

            {/* Body — fila de filas */}
            <div className="col-span-4 mt-2 overflow-hidden rounded-[1.75rem] border border-[rgba(20,22,58,0.08)] bg-white shadow-[0_18px_40px_rgba(20,22,58,0.06)]">
              {rows.map((row, idx) => (
                <div
                  key={row.label}
                  className={`grid grid-cols-[180px_1fr_1fr_1fr] xl:grid-cols-[220px_1fr_1fr_1fr] ${
                    idx !== rows.length - 1
                      ? "border-b border-[rgba(20,22,58,0.06)]"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5 bg-[var(--color-ca-bg)] px-5 py-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-ca-ink-soft)]">
                    <span className="text-[var(--color-ca-violet)]">{row.icon}</span>
                    {row.label}
                  </div>
                  {PROGRAMS_LIST.map((p) => {
                    const isFeatured = p.id === FEATURED_ID;
                    let value: React.ReactNode;

                    if (row.key === "modulesText") {
                      value = (
                        <span className="text-sm font-semibold text-[var(--color-ca-ink)]">
                          {p.modules} módulos
                        </span>
                      );
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
                    } else if (row.key === "nextStart") {
                      value = (
                        <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(20,22,58,0.08)] bg-[var(--color-ca-bg)] px-3 py-1.5">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-ca-lime-deep)] opacity-60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-ca-lime-deep)]" />
                          </span>
                          <span className="text-[12px] font-bold text-[var(--color-ca-ink)]">
                            {p.nextStart}
                          </span>
                        </span>
                      );
                    } else {
                      value = (
                        <span className="text-sm font-semibold text-[var(--color-ca-ink)]">
                          {p[row.key]}
                        </span>
                      );
                    }

                    return (
                      <div
                        key={p.id}
                        className={`px-5 py-5 ${
                          isFeatured ? "bg-[var(--color-ca-violet)]/[0.03]" : ""
                        }`}
                      >
                        {value}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* CTAs por columna */}
            <div />
            {PROGRAMS_LIST.map((p) => {
              const isFeatured = p.id === FEATURED_ID;
              return (
                <div key={p.id} className="pt-2">
                  <a
                    href={p.href}
                    className={`flex h-12 w-full items-center justify-center rounded-full px-5 text-[12px] font-bold uppercase tracking-[0.16em] transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2 ${
                      isFeatured
                        ? "bg-[var(--color-ca-violet)] text-white shadow-[0_12px_28px_rgba(94,23,235,0.35)] hover:bg-[var(--color-ca-violet-deep)]"
                        : "border border-[var(--color-ca-ink)]/15 bg-white text-[var(--color-ca-ink)] hover:border-[var(--color-ca-violet)] hover:text-[var(--color-ca-violet)]"
                    }`}
                  >
                    Ver {p.tag}
                  </a>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============ MOBILE / TABLET ============ */}
        <div className="mt-14 grid gap-5 lg:hidden">
          {PROGRAMS_LIST.map((p) => {
            const t = themeStyles[p.theme];
            const isFeatured = p.id === FEATURED_ID;
            return (
              <article
                key={p.id}
                className={`relative overflow-hidden rounded-[1.75rem] border bg-white shadow-[0_18px_40px_rgba(20,22,58,0.06)] ${
                  isFeatured
                    ? "border-[var(--color-ca-violet)]/30"
                    : "border-[rgba(20,22,58,0.08)]"
                }`}
              >
                {isFeatured && (
                  <div className="bg-[var(--color-ca-violet)] px-5 py-2 text-center text-[10px] font-bold uppercase tracking-[0.22em] text-white">
                    Más elegido
                  </div>
                )}
                <div className="p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-ca-bg)]">
                      <ProgramGlyph program={p.id} className="h-7 w-7" />
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-[0.22em] ${t.badge}`}
                    >
                      {p.tag}
                    </span>
                  </div>
                  <h3 className="mt-4 text-2xl font-black leading-tight tracking-[-0.02em] text-[var(--color-ca-ink)]">
                    {p.shortTitle}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">
                    {p.subtitle}
                  </p>

                  <dl className="mt-5 divide-y divide-[rgba(20,22,58,0.06)]">
                    {rows.map((row) => {
                      let value: React.ReactNode;
                      if (row.key === "modulesText") {
                        value = `${p.modules} módulos`;
                      } else if (row.key === "audienceTags" || row.key === "areas") {
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
                      } else if (row.key === "nextStart") {
                        value = (
                          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(20,22,58,0.08)] bg-[var(--color-ca-bg)] px-3 py-1">
                            <span className="h-2 w-2 rounded-full bg-[var(--color-ca-lime-deep)]" />
                            <span className="text-[12px] font-bold text-[var(--color-ca-ink)]">
                              {p.nextStart}
                            </span>
                          </span>
                        );
                      } else {
                        value = (
                          <span className="text-sm font-semibold text-[var(--color-ca-ink)]">
                            {p[row.key]}
                          </span>
                        );
                      }
                      return (
                        <div
                          key={row.label}
                          className="flex items-start justify-between gap-4 py-3"
                        >
                          <dt className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-ca-ink-soft)]">
                            <span className="text-[var(--color-ca-violet)]">{row.icon}</span>
                            {row.label}
                          </dt>
                          <dd className="max-w-[60%] text-right">{value}</dd>
                        </div>
                      );
                    })}
                  </dl>

                  <a
                    href={p.href}
                    className={`mt-6 flex h-12 w-full items-center justify-center rounded-full px-5 text-[12px] font-bold uppercase tracking-[0.16em] transition-all ${
                      isFeatured
                        ? "bg-[var(--color-ca-violet)] text-white shadow-[0_12px_28px_rgba(94,23,235,0.35)] hover:bg-[var(--color-ca-violet-deep)]"
                        : "border border-[var(--color-ca-ink)]/15 bg-white text-[var(--color-ca-ink)] hover:border-[var(--color-ca-violet)] hover:text-[var(--color-ca-violet)]"
                    }`}
                  >
                    Ver {p.tag}
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
