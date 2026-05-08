import Image from "next/image";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-ca-bg)]">
      {/* Brand shapes — replicando portada del manual gráfico */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-10 h-[520px] w-[520px] brand-half-violet hidden md:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-72 top-44 h-[400px] w-[400px] brand-circle-lime hidden md:block"
      />
      {/* Mobile decorative shape */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-16 h-72 w-72 brand-circle-violet opacity-90 md:hidden"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 bottom-10 h-44 w-44 brand-circle-lime md:hidden"
      />

      <div className="relative z-10 mx-auto grid max-w-6xl gap-10 px-6 pb-24 pt-20 sm:pt-28 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-32">
        <div>
          <Image
            src="/brand/logo-on-light.png"
            alt="Capital Academy"
            width={120}
            height={119}
            priority
            className="mb-8 h-16 w-auto sm:h-20"
          />

          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--color-ca-violet)]/30 bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ca-violet)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ca-violet)]" />
            Escuela de negocios de Capital Inteligente
          </span>

          <h1 className="font-sans text-5xl font-black leading-[0.95] tracking-[-0.04em] text-[var(--color-ca-ink)] sm:text-6xl md:text-7xl">
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

          <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <a
              href="#programas"
              className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-8 text-sm font-bold uppercase tracking-[0.15em] text-white shadow-[0_12px_32px_rgba(94,23,235,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)] active:scale-[0.98]"
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

          <div className="mt-10 inline-flex max-w-md items-start gap-4 rounded-2xl border border-[rgba(20,22,58,0.12)] bg-white px-5 py-4">
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

        {/* Right panel placeholder for visual balance on desktop */}
        <div className="hidden lg:block" aria-hidden />
      </div>
    </section>
  );
}
