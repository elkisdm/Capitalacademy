export function QueEs() {
  return (
    <section
      id="que-es"
      className="relative overflow-hidden bg-[var(--color-ca-violet-soft)] py-24 sm:py-28"
    >
      <div className="pointer-events-none absolute -left-40 top-10 h-[420px] w-[420px] brand-half-violet-right opacity-90" aria-hidden />

      <div className="relative z-10 mx-auto max-w-4xl px-6">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-violet)]">
          ¿Qué es Capital Academy?
        </p>
        <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
          La escuela que eleva el estándar de la{" "}
          <span className="text-[var(--color-ca-violet)]">
            industria inmobiliaria
          </span>
        </h2>

        <div className="mt-10 grid gap-6 text-base leading-relaxed text-[var(--color-ca-ink)] sm:text-lg md:grid-cols-2">
          <p>
            Capital Academy es la escuela de negocios de{" "}
            <strong>Capital Inteligente</strong>, creada para elevar el
            estándar de formación en la industria inmobiliaria.
          </p>
          <p>
            Nace para preparar asesores, líderes y emprendedores con mayor
            criterio comercial, dominio técnico, visión de negocio y capacidad
            de responder a un mercado cada vez más exigente.
          </p>
        </div>

        <blockquote className="mt-12 rounded-3xl bg-white px-8 py-7 shadow-[0_18px_40px_rgba(94,23,235,0.12)]">
          <p className="text-xl font-semibold leading-snug text-[var(--color-ca-ink)] sm:text-2xl">
            “No formamos solo vendedores. Formamos profesionales capaces de{" "}
            <span className="text-[var(--color-ca-violet)]">
              asesorar, liderar y crecer en serio
            </span>{" "}
            dentro de la industria.”
          </p>
        </blockquote>
      </div>
    </section>
  );
}
