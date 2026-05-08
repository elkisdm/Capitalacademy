import { COMUNIDAD_WHATSAPP_URL } from "@/lib/landing/constants";

export function Cierre() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-ca-violet)] py-24 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-10 h-[480px] w-[480px] brand-circle-lime opacity-90"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 bottom-0 h-80 w-80 brand-circle-lavender opacity-30"
      />

      <div className="relative z-10 mx-auto max-w-4xl px-6">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-lime)]">
          Cierre
        </p>
        <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] text-white sm:text-5xl md:text-6xl">
          Forma parte de una nueva{" "}
          <span className="text-[var(--color-ca-lime)]">
            comunidad de aprendizaje
          </span>{" "}
          inmobiliario
        </h2>

        <div className="mt-8 grid gap-5 text-base leading-relaxed text-white/90 sm:text-lg md:grid-cols-2">
          <p>
            En Capital Academy creemos que una mejor industria se construye
            formando mejores asesores, mejores líderes y mejores profesionales.
          </p>
          <p>
            Por eso, además de nuestros programas formativos, queremos abrir un
            espacio de conexión para quienes buscan crecer en serio dentro del
            mundo inmobiliario, mantenerse actualizados y ser parte de la
            comunidad que comparte conocimiento, oportunidades y visión de
            futuro.
          </p>
        </div>

        <div className="mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <a
            href="#contacto"
            className="inline-flex h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-bold uppercase tracking-[0.15em] text-[var(--color-ca-violet)] shadow-[0_12px_32px_rgba(0,0,0,0.18)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-bg)]"
          >
            Solicitar información sobre los programas
          </a>
          <a
            href={COMUNIDAD_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ca-lime)] px-8 text-sm font-bold uppercase tracking-[0.15em] text-[var(--color-ca-ink)] shadow-[0_12px_32px_rgba(197,241,34,0.4)] transition-all hover:-translate-y-0.5"
          >
            Unirme al chat de la comunidad
          </a>
        </div>

        <p className="mt-6 text-sm text-white/70">
          Conecta con otros profesionales del rubro, recibe novedades de
          Capital Academy y mantente al tanto de próximas instancias formativas.
        </p>
      </div>
    </section>
  );
}
