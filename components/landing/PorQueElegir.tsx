import Image from "next/image";
import { IMG } from "@/lib/landing/images";

const razones = [
  {
    title: "Experiencia real del negocio",
    desc: "Formación creada desde la operación inmobiliaria diaria, no desde la teoría.",
  },
  {
    title: "Docentes activos en la industria",
    desc: "Brokers, líderes y operadores que ejercen hoy en el mercado.",
  },
  {
    title: "Programas aplicados",
    desc: "Casos reales, herramientas concretas, resultados medibles.",
  },
  {
    title: "Ecosistema Capital Inteligente",
    desc: "Acceso a la red, oportunidades y partners del grupo.",
  },
  {
    title: "Foco en resultados sostenibles",
    desc: "Criterio profesional que escala con tu carrera, no fórmulas pasajeras.",
  },
];

export function PorQueElegir() {
  return (
    <section
      id="por-que"
      className="relative overflow-hidden bg-[var(--color-ca-bg)] py-24 sm:py-28"
    >
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          {/* Foto editorial */}
          <div className="relative order-2 lg:order-1">
            <div className="relative aspect-[5/6] w-full overflow-hidden rounded-[2rem] shadow-[0_30px_80px_rgba(20,22,58,0.18)]">
              <Image
                src={IMG.porQueElegir.src}
                alt={IMG.porQueElegir.alt}
                fill
                sizes="(min-width: 1024px) 540px, 100vw"
                className="object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[var(--color-ca-navy-deep)]/50 via-transparent to-transparent mix-blend-multiply" />
            </div>
            <div className="absolute -right-6 -top-6 hidden rounded-2xl bg-[var(--color-ca-violet)] px-5 py-4 shadow-[0_18px_36px_rgba(94,23,235,0.35)] sm:block">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">
                Capital Academy
              </p>
              <p className="mt-1 text-xl font-black text-white">
                Estándar profesional
              </p>
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 brand-circle-lime"
            />
          </div>

          <div className="order-1 lg:order-2">
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-violet)]">
              Por qué elegir Capital Academy
            </p>
            <h2 className="text-4xl font-black leading-[1.02] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
              Formación que se{" "}
              <span className="text-[var(--color-ca-violet)]">nota</span> en el
              mercado.
            </h2>

            <ul className="mt-10 space-y-5">
              {razones.map((r, i) => (
                <li
                  key={r.title}
                  className="flex gap-5 border-t border-[rgba(20,22,58,0.1)] pt-5"
                >
                  <span className="text-2xl font-black tabular-nums text-[var(--color-ca-violet)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-[var(--color-ca-ink)] sm:text-lg">
                      {r.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">
                      {r.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
