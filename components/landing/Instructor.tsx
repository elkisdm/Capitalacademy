import Image from "next/image";
import { INSTRUCTORS } from "@/lib/landing/team";

export function Instructor() {
  return (
    <section
      id="docentes"
      className="relative overflow-hidden bg-[var(--color-ca-bg)] py-24 sm:py-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-20 h-72 w-72 brand-circle-lavender opacity-40 blur-2xl"
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-violet)]">
            Equipo docente
          </p>
          <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
            Aprendes con quienes{" "}
            <span className="text-[var(--color-ca-violet)]">
              ejercen hoy
            </span>{" "}
            en la industria
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-lg">
            Nuestros docentes son profesionales activos, con experiencia real
            del negocio inmobiliario. No formadores teóricos: operadores que
            están en la cancha.
          </p>
        </div>

        <div className="mt-14 grid gap-8">
          {INSTRUCTORS.map((i) => (
            <article
              key={i.id}
              className="grid gap-8 rounded-[2rem] border border-[rgba(20,22,58,0.08)] bg-white p-6 shadow-[0_18px_40px_rgba(20,22,58,0.06)] sm:p-8 lg:grid-cols-[280px_1fr] lg:items-center lg:gap-10"
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[1.5rem] bg-[var(--color-ca-violet-soft)] lg:max-w-[280px]">
                <Image
                  src={i.image.src}
                  alt={i.image.alt}
                  fill
                  sizes="(min-width: 1024px) 280px, 100vw"
                  className="object-cover object-top"
                  loading="lazy"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[var(--color-ca-navy-deep)]/60 to-transparent" />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-3 -right-3 h-16 w-16 brand-circle-lime"
                />
              </div>

              <div>
                <span className="inline-flex items-center rounded-full bg-[var(--color-ca-lime)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ca-ink)]">
                  Directora académica
                </span>
                <h3 className="mt-4 text-3xl font-black tracking-[-0.02em] text-[var(--color-ca-ink)] sm:text-4xl">
                  {i.name}
                </h3>
                <p className="mt-1 text-sm font-semibold text-[var(--color-ca-violet)]">
                  {i.role}
                </p>
                <p className="mt-5 text-base leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-lg">
                  {i.bio}
                </p>
                <div className="mt-6">
                  <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ca-violet)]">
                    Áreas de expertise
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {i.expertise.map((e) => (
                      <li
                        key={e}
                        className="inline-flex items-center rounded-lg border border-[var(--color-ca-violet)]/25 bg-[var(--color-ca-violet)]/[0.06] px-3 py-1.5 text-xs font-semibold text-[var(--color-ca-violet-deep)]"
                      >
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
