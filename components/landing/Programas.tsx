import Image from "next/image";
import { PROGRAMS_LIST, themeStyles } from "@/lib/landing/programs";
import { ProgramGlyph } from "./ProgramGlyph";

export function Programas() {
  return (
    <section
      id="programas"
      className="relative overflow-hidden bg-[var(--color-ca-bg)] py-24 sm:py-28"
    >
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-violet)]">
              Nuestros programas
            </p>
            <h2 className="text-4xl font-black leading-[1.02] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl lg:text-7xl">
              Tres caminos para{" "}
              <span className="text-[var(--color-ca-violet)]">
                tres etapas
              </span>{" "}
              de desarrollo
            </h2>
          </div>
          <p className="text-base leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-lg">
            Capital Academy cuenta con programas diseñados para distintos
            perfiles y momentos profesionales dentro de la industria
            inmobiliaria.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {PROGRAMS_LIST.map((p) => {
            const t = themeStyles[p.theme];
            return (
              <article
                key={p.id}
                className="group relative flex flex-col overflow-hidden rounded-[1.75rem] border border-[rgba(20,22,58,0.06)] bg-white transition-all hover:-translate-y-1.5 hover:shadow-[0_36px_72px_rgba(94,23,235,0.18)]"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  <Image
                    src={p.image.src}
                    alt={p.image.alt}
                    fill
                    sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div
                    className={`absolute inset-0 bg-gradient-to-t ${t.bar} opacity-30 mix-blend-multiply`}
                  />
                  <div className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${t.bar}`} />
                  {/* Glifo flotante */}
                  <div className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_8px_24px_rgba(20,22,58,0.18)]">
                    <ProgramGlyph program={p.id} className="h-7 w-7" />
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-7">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${t.badge}`}
                    >
                      {p.tag}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(20,22,58,0.12)] bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ca-ink-soft)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ca-violet)]" />
                      {p.level}
                    </span>
                  </div>

                  <h3 className="mt-4 text-xl font-bold leading-tight text-[var(--color-ca-ink)] sm:text-2xl">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">
                    {p.description}
                  </p>

                  {/* Metadata bar tipo Platzi */}
                  <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-[rgba(20,22,58,0.08)] pt-4 text-xs">
                    <div>
                      <dt className="font-bold uppercase tracking-[0.14em] text-[var(--color-ca-ink-soft)]">
                        Duración
                      </dt>
                      <dd className="mt-0.5 text-sm font-semibold text-[var(--color-ca-ink)]">
                        {p.duration}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold uppercase tracking-[0.14em] text-[var(--color-ca-ink-soft)]">
                        Módulos
                      </dt>
                      <dd className="mt-0.5 text-sm font-semibold text-[var(--color-ca-ink)]">
                        {p.modules}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="font-bold uppercase tracking-[0.14em] text-[var(--color-ca-ink-soft)]">
                        Para
                      </dt>
                      <dd className="mt-1.5 flex flex-wrap gap-1.5">
                        {p.audienceTags.map((tag) => (
                          <span
                            key={tag}
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${t.chip}`}
                          >
                            {tag}
                          </span>
                        ))}
                      </dd>
                    </div>
                  </dl>

                  <a
                    href={p.href}
                    className="mt-6 inline-flex h-11 items-center justify-between rounded-full bg-[var(--color-ca-ink)] px-6 text-xs font-bold uppercase tracking-[0.18em] text-white transition-all group-hover:bg-[var(--color-ca-violet)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  >
                    Ver programa
                    <svg
                      viewBox="0 0 24 24"
                      className="ml-2 h-4 w-4"
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
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
