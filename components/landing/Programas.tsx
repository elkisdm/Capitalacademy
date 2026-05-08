import Image from "next/image";
import { IMG } from "@/lib/landing/images";

const programas = [
  {
    id: "diplomado",
    tag: "Diplomado",
    title: "Ventas y Asesoría Inmobiliaria",
    desc: "Para asesores, brokers y ejecutivos que quieren vender mejor, asesorar con más solidez y elevar su nivel profesional.",
    href: "#detalle-diplomado",
    image: IMG.programaDiplomado,
    accent: "lime",
  },
  {
    id: "liderazgo",
    tag: "Programa",
    title: "Liderazgo y Gestión de Equipos",
    desc: "Para jefaturas, líderes comerciales y profesionales que buscan construir, conducir y sostener equipos de alto desempeño.",
    href: "#detalle-liderazgo",
    image: IMG.programaLiderazgo,
    accent: "lavender",
  },
  {
    id: "ruta",
    tag: "Programa",
    title: "Ruta Inmobiliaria",
    desc: "Para emprendedores y profesionales que buscan abrir una nueva etapa laboral con respaldo, formación y visión de negocio.",
    href: "#detalle-ruta",
    image: IMG.programaRuta,
    accent: "violet",
  },
] as const;

const accentMap = {
  lime: {
    badge: "bg-[var(--color-ca-lime)] text-[var(--color-ca-ink)]",
    bar: "from-[var(--color-ca-lime)] to-[var(--color-ca-lime-deep)]",
  },
  lavender: {
    badge: "bg-[var(--color-ca-violet-soft)] text-[var(--color-ca-violet-deep)]",
    bar: "from-[var(--color-ca-violet-soft)] to-[var(--color-ca-violet)]",
  },
  violet: {
    badge: "bg-[var(--color-ca-violet)] text-white",
    bar: "from-[var(--color-ca-violet)] to-[var(--color-ca-violet-deep)]",
  },
} as const;

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
          {programas.map((p) => {
            const a = accentMap[p.accent];
            return (
              <article
                key={p.id}
                className="group relative flex flex-col overflow-hidden rounded-[1.75rem] border border-[rgba(20,22,58,0.06)] bg-white transition-all hover:-translate-y-1.5 hover:shadow-[0_36px_72px_rgba(94,23,235,0.18)]"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  <Image
                    src={p.image.src}
                    alt={p.image.alt}
                    fill
                    sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div
                    className={`absolute inset-0 bg-gradient-to-t ${a.bar} opacity-30 mix-blend-multiply`}
                  />
                  <div className={`absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${a.bar}`} />
                </div>

                <div className="flex flex-1 flex-col p-7">
                  <span
                    className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${a.badge}`}
                  >
                    {p.tag}
                  </span>
                  <h3 className="mt-4 text-xl font-bold leading-tight text-[var(--color-ca-ink)] sm:text-2xl">
                    {p.title}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">
                    {p.desc}
                  </p>
                  <a
                    href={p.href}
                    className="mt-6 inline-flex h-11 items-center justify-between rounded-full bg-[var(--color-ca-ink)] px-6 text-xs font-bold uppercase tracking-[0.18em] text-white transition-all group-hover:bg-[var(--color-ca-violet)]"
                  >
                    Ver programa
                    <svg
                      viewBox="0 0 24 24"
                      className="ml-2 h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
