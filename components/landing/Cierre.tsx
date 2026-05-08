import Image from "next/image";
import { COMUNIDAD_WHATSAPP_URL } from "@/lib/landing/constants";
import { IMG } from "@/lib/landing/images";

export function Cierre() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-ca-violet)] py-24 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-44 top-10 h-[500px] w-[500px] brand-circle-lime opacity-90"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 bottom-0 h-80 w-80 brand-circle-lavender opacity-25"
      />

      <div className="relative z-10 mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-lime)]">
            Cierre
          </p>
          <h2 className="text-4xl font-black leading-[1.02] tracking-[-0.03em] text-white sm:text-5xl md:text-6xl lg:text-7xl">
            Forma parte de una nueva{" "}
            <span className="text-[var(--color-ca-lime)]">
              comunidad
            </span>{" "}
            de aprendizaje inmobiliario
          </h2>

          <div className="mt-8 space-y-5 text-base leading-relaxed text-white/90 sm:text-lg">
            <p>
              En Capital Academy creemos que una mejor industria se construye
              formando mejores asesores, mejores líderes y mejores
              profesionales.
            </p>
            <p>
              Por eso, además de nuestros programas formativos, queremos abrir
              un espacio de conexión para quienes buscan crecer en serio
              dentro del mundo inmobiliario y ser parte de la comunidad que
              comparte conocimiento, oportunidades y visión de futuro.
            </p>
          </div>

          <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <a
              href="#contacto"
              className="inline-flex h-12 items-center justify-center rounded-full bg-white px-7 text-sm font-bold uppercase tracking-[0.15em] text-[var(--color-ca-violet)] shadow-[0_12px_32px_rgba(0,0,0,0.18)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-bg)]"
            >
              Solicitar información
            </a>
            <a
              href={COMUNIDAD_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ca-lime)] px-7 text-sm font-bold uppercase tracking-[0.15em] text-[var(--color-ca-ink)] shadow-[0_12px_32px_rgba(197,241,34,0.4)] transition-all hover:-translate-y-0.5"
            >
              Unirme al chat
            </a>
          </div>

          <p className="mt-6 max-w-md text-sm text-white/70">
            Conecta con otros profesionales del rubro, recibe novedades de
            Capital Academy y mantente al tanto de próximas instancias
            formativas.
          </p>
        </div>

        {/* Foto comunidad */}
        <div className="relative">
          <div className="relative aspect-square w-full overflow-hidden rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.3)]">
            <Image
              src={IMG.cierre.src}
              alt={IMG.cierre.alt}
              fill
              sizes="(min-width: 1024px) 480px, 100vw"
              className="object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--color-ca-violet-deep)]/40 via-transparent to-[var(--color-ca-lime)]/15 mix-blend-multiply" />
          </div>
        </div>
      </div>
    </section>
  );
}
