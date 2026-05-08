import Image from "next/image";
import { PROGRAMS_LIST } from "@/lib/landing/programs";

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
          {PROGRAMS_LIST.map((p) => (
            <article
              key={p.id}
              className="group flex flex-col overflow-hidden rounded-[1.75rem] border border-[rgba(20,22,58,0.06)] bg-white transition-all hover:-translate-y-1.5 hover:shadow-[0_36px_72px_rgba(94,23,235,0.18)]"
            >
              {/* Brochure brand del programa (gpt-image-2, 16:9) */}
              <a
                href={p.href}
                aria-label={`Ver detalle del programa ${p.title}`}
                className="relative block aspect-[16/10] w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2"
              >
                <Image
                  src={p.cardImage.src}
                  alt={p.cardImage.alt}
                  fill
                  sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                />
                {p.discountLabel && (
                  <span className="absolute left-4 top-4 inline-flex items-center rounded-md bg-[var(--color-ca-lime)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--color-ca-ink)] shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
                    {p.discountLabel}
                  </span>
                )}
              </a>

              {/* Footer informativo + CTA */}
              <div className="flex flex-1 flex-col p-6">
                <p className="text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">
                  {p.description}
                </p>

                <div className="mt-5 flex flex-wrap gap-1.5">
                  {p.audienceTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex h-6 items-center rounded-md border border-[rgba(20,22,58,0.1)] bg-[var(--color-ca-bg)] px-2 text-[10px] font-semibold text-[var(--color-ca-ink-soft)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-auto pt-5">
                  <div className="mb-3 flex items-center gap-2 rounded-xl bg-[var(--color-ca-bg)] px-3 py-2 text-xs">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 shrink-0 text-[var(--color-ca-violet)]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M3 10h18M8 3v4M16 3v4" />
                    </svg>
                    <span className="font-semibold text-[var(--color-ca-ink)]">
                      {p.nextStart}
                    </span>
                    <span className="ml-auto text-[var(--color-ca-ink-soft)]">
                      · {p.cohortSize}
                    </span>
                  </div>

                  {p.paymentUrl ? (
                    <div className="grid gap-2">
                      <a
                        href={p.paymentUrl}
                        className="inline-flex h-11 w-full items-center justify-between rounded-full bg-[var(--color-ca-violet)] px-6 text-xs font-bold uppercase tracking-[0.18em] text-white shadow-[0_8px_24px_rgba(94,23,235,0.3)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2"
                      >
                        Inscribirme ahora
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
                      <a
                        href={p.href}
                        className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[rgba(20,22,58,0.12)] bg-white px-6 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-ca-ink-soft)] transition-colors hover:border-[var(--color-ca-violet)]/40 hover:text-[var(--color-ca-violet)]"
                      >
                        Ver programa completo
                      </a>
                    </div>
                  ) : (
                    <a
                      href={p.href}
                      className="inline-flex h-11 w-full items-center justify-between rounded-full bg-[var(--color-ca-ink)] px-6 text-xs font-bold uppercase tracking-[0.18em] text-white transition-all hover:bg-[var(--color-ca-violet)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2"
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
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
