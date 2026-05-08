import { Formulario } from "./Formulario";

export function SeccionContacto() {
  return (
    <section
      id="contacto"
      className="relative scroll-mt-24 overflow-hidden bg-[var(--color-ca-bg)] py-24 sm:py-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-32 h-72 w-72 brand-circle-lavender opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-24 h-56 w-56 brand-circle-lime opacity-50"
      />

      <div className="relative z-10 mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-3xl">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-violet)]">
            Formulario de captación
          </p>
          <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
            Encuentra el programa que mejor se ajusta a tu{" "}
            <span className="text-[var(--color-ca-violet)]">
              etapa profesional
            </span>
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-lg">
            Déjanos tus datos y nuestro equipo te contactará para orientarte.
          </p>
        </div>

        <div className="relative mt-12">
          <Formulario />
        </div>
      </div>
    </section>
  );
}
