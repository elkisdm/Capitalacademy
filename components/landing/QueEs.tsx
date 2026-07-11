import Image from "next/image";
import { IMG } from "@/lib/landing/images";

export function QueEs() {
  return (
    <section
      id="que-es"
      className="relative scroll-mt-24 overflow-hidden bg-[var(--color-ca-violet-soft)] py-24 sm:py-28"
    >
      {/* Decorativo: lo movemos a la esquina inferior derecha y opacity baja para que no pise el copy */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 z-0 h-[460px] w-[460px] brand-circle-violet opacity-30 blur-2xl"
      />

      <div className="relative z-10 mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-violet)]">
            ¿Qué es Capital Academy?
          </p>
          <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
            La escuela que eleva el estándar de la{" "}
            <span className="text-[var(--color-ca-violet)]">
              industria inmobiliaria
            </span>
          </h2>

          <div className="mt-8 space-y-5 text-base leading-relaxed text-[var(--color-ca-ink)] sm:text-lg">
            <p>
              Capital Academy es la escuela de negocios de{" "}
              <strong>Capital Inteligente</strong>, creada para elevar el
              estándar de formación en la industria inmobiliaria.
            </p>
            <p>
              Nace para preparar asesores, líderes y emprendedores con mayor
              criterio comercial, dominio técnico, visión de negocio y
              capacidad de responder a un mercado cada vez más exigente.
            </p>
          </div>

          <blockquote className="mt-10 rounded-3xl bg-white px-7 py-6 shadow-[0_18px_40px_rgba(94,23,235,0.12)]">
            <p className="text-lg font-semibold leading-snug text-[var(--color-ca-ink)] sm:text-xl">
              “No formamos solo vendedores. Formamos profesionales capaces de{" "}
              <span className="text-[var(--color-ca-violet)]">
                asesorar, liderar y crecer en serio
              </span>{" "}
              dentro de la industria.”
            </p>
          </blockquote>
        </div>

        {/* Foto editorial */}
        <div className="relative">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] shadow-[0_30px_80px_rgba(94,23,235,0.25)]">
            <Image
              src={IMG.queEs.src}
              alt={IMG.queEs.alt}
              fill
              sizes="(min-width: 1024px) 480px, 100vw"
              className="object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-transparent via-[var(--color-ca-violet)]/15 to-[var(--color-ca-violet)]/55 mix-blend-multiply" />
          </div>

          <div className="absolute -bottom-6 -left-6 hidden rounded-2xl bg-[var(--color-ca-lime)] px-5 py-4 shadow-[0_18px_36px_rgba(20,22,58,0.16)] sm:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ca-ink)]">
              Capital Inteligente
            </p>
            <p className="mt-1 text-sm font-black text-[var(--color-ca-ink)]">
              Ecosistema inmobiliario
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
