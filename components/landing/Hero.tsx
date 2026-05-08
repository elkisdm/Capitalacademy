import Image from "next/image";
import { IMG } from "@/lib/landing/images";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-ca-bg)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-44 h-72 w-72 brand-circle-lime opacity-25 blur-2xl"
      />

      <div className="relative z-10 mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-16 sm:pt-24 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:pb-28">
        <div className="relative">
          <Image
            src="/brand/logo-on-light.png"
            alt="Capital Academy"
            width={120}
            height={119}
            priority
            className="mb-7 h-14 w-auto sm:h-16"
          />

          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-ca-violet)]/25 bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ca-violet)]" />
            Escuela de negocios · Capital Inteligente
          </span>

          <h1 className="font-sans text-5xl font-black leading-[0.95] tracking-[-0.04em] text-[var(--color-ca-ink)] sm:text-6xl md:text-7xl lg:text-[5.5rem]">
            Capital{" "}
            <span className="text-[var(--color-ca-violet)]">Academy</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-ca-ink)] sm:text-xl">
            La escuela de negocios de Capital Inteligente.
          </p>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-lg">
            Formación ejecutiva para elevar el estándar de la industria
            inmobiliaria.
          </p>

          <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <a
              href="#programas"
              className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-8 text-sm font-bold uppercase tracking-[0.15em] text-white shadow-[0_12px_32px_rgba(94,23,235,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)] active:scale-[0.98]"
            >
              Conoce nuestros programas
            </a>
            <a
              href="#contacto"
              className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--color-ca-ink)]/15 bg-white px-8 text-sm font-bold uppercase tracking-[0.15em] text-[var(--color-ca-ink)] transition-all hover:border-[var(--color-ca-violet)] hover:text-[var(--color-ca-violet)]"
            >
              Solicitar información
            </a>
          </div>

          <div className="mt-10 inline-flex max-w-md items-start gap-4 rounded-2xl border border-[rgba(20,22,58,0.1)] bg-white px-5 py-4">
            <div className="text-3xl leading-none text-[var(--color-ca-violet)]">
              “
            </div>
            <p className="text-sm leading-snug text-[var(--color-ca-ink-soft)]">
              La disciplina convierte la habilidad en{" "}
              <span className="font-semibold text-[var(--color-ca-ink)]">
                excelencia.
              </span>
            </p>
          </div>
        </div>

        {/* Visual panel — foto + brand shapes */}
        <div className="relative mt-2 lg:mt-0">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] shadow-[0_30px_80px_rgba(20,22,58,0.18)]">
            <Image
              src={IMG.hero.src}
              alt={IMG.hero.alt}
              fill
              priority
              sizes="(min-width: 1024px) 540px, 100vw"
              className="object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[var(--color-ca-violet)]/45 via-[var(--color-ca-violet)]/10 to-transparent mix-blend-multiply" />
            <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
              <div className="rounded-2xl bg-white/95 px-4 py-3 backdrop-blur-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ca-violet)]">
                  Formación ejecutiva
                </p>
                <p className="mt-1 text-sm font-bold text-[var(--color-ca-ink)]">
                  Brokers · Líderes · Emprendedores
                </p>
              </div>
            </div>
          </div>

          {/* Brand decorations alrededor del frame */}
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-10 -left-10 h-44 w-44 brand-circle-lime"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 top-10 h-24 w-24 brand-circle-violet opacity-90"
          />
        </div>
      </div>
    </section>
  );
}
