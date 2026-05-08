import Image from "next/image";
import { IMG } from "@/lib/landing/images";

type Theme = "lime" | "lavender" | "violet";
type ImgKey = "detalleDiplomado" | "detalleLiderazgo" | "detalleRuta";

type Detalle = {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  audience: string[];
  develops: string[];
  highlight: string;
  cta: string;
  theme: Theme;
  imgKey: ImgKey;
};

const detalles: Detalle[] = [
  {
    id: "detalle-diplomado",
    badge: "Diplomado",
    title: "Ventas y Asesoría Inmobiliaria",
    subtitle:
      "Formación ejecutiva para quienes quieren vender mejor y asesorar con más criterio.",
    description:
      "Un programa diseñado para brokers, asesores inmobiliarios y ejecutivos de sala de venta que buscan fortalecer su gestión comercial, comprender mejor el mercado y desarrollar una asesoría más sólida, profesional y confiable.",
    audience: [
      "Brokers y asesores inmobiliarios",
      "Ejecutivos de sala de venta",
      "Profesionales del rubro que quieren elevar su nivel comercial",
    ],
    develops: [
      "Ventas y asesoría inmobiliaria",
      "Criterio comercial",
      "Manejo de objeciones",
      "Seguimiento efectivo",
      "Educación financiera aplicada",
      "Profesionalización del rol asesor",
    ],
    highlight:
      "Porque hoy vender propiedades exige mucho más que intención comercial. Exige preparación, criterio y confianza.",
    cta: "Quiero información del Diplomado",
    theme: "lime",
    imgKey: "detalleDiplomado",
  },
  {
    id: "detalle-liderazgo",
    badge: "Liderazgo",
    title: "Liderazgo y Gestión de Equipos Comerciales",
    subtitle:
      "Herramientas para construir, liderar y sostener equipos a la altura de grandes metas.",
    description:
      "Un programa diseñado para jefaturas, líderes comerciales, team leaders y profesionales que buscan construir, conducir y sostener equipos de venta con mayor estructura, foco y desempeño.",
    audience: [
      "Jefaturas comerciales",
      "Líderes de equipo",
      "Profesionales que quieren crear o fortalecer un equipo comercial",
    ],
    develops: [
      "Reclutamiento de talento",
      "Motivación y desarrollo de equipos",
      "Liderazgo comercial",
      "Gestión del tiempo",
      "Autoliderazgo",
      "Foco en metas y resultados sostenibles",
    ],
    highlight:
      "Las grandes metas exigen más que visión: exigen equipo, estructura y liderazgo.",
    cta: "Quiero información del Programa de Liderazgo",
    theme: "lavender",
    imgKey: "detalleLiderazgo",
  },
  {
    id: "detalle-ruta",
    badge: "Ruta",
    title: "Programa Ruta Inmobiliaria",
    subtitle: "Un nuevo camino profesional con respaldo y visión de negocio.",
    description:
      "Ruta Inmobiliaria es un programa orientado a emprendedores y profesionales que buscan reinventarse, abrir una nueva etapa laboral o ingresar al mundo inmobiliario con una mirada más estructurada, acompañada y realista.",
    audience: [
      "Emprendedores",
      "Profesionales en etapa de reinvención",
      "Personas que buscan una nueva oportunidad dentro del rubro",
      "Futuros Business Partners",
    ],
    develops: [
      "Visión integral del negocio inmobiliario",
      "Comprensión práctica del ecosistema",
      "Criterio para identificar oportunidades",
      "Acompañamiento experto",
      "Proyección profesional dentro de la industria",
    ],
    highlight:
      "Cuando el desafío actual deja de crecer, puede comenzar una nueva etapa.",
    cta: "Quiero información de Ruta Inmobiliaria",
    theme: "violet",
    imgKey: "detalleRuta",
  },
];

const themeMap: Record<
  Theme,
  { section: string; badge: string; quoteBar: string; chipBg: string; reverse: boolean }
> = {
  lime: {
    section: "bg-[var(--color-ca-bg)]",
    badge: "bg-[var(--color-ca-lime)] text-[var(--color-ca-ink)]",
    quoteBar: "border-[var(--color-ca-lime-deep)]",
    chipBg: "bg-[var(--color-ca-lime)]",
    reverse: false,
  },
  lavender: {
    section: "bg-[var(--color-ca-violet-soft)]",
    badge: "bg-[var(--color-ca-violet)] text-white",
    quoteBar: "border-[var(--color-ca-violet)]",
    chipBg: "bg-white",
    reverse: true,
  },
  violet: {
    section: "bg-[var(--color-ca-bg)]",
    badge: "bg-[var(--color-ca-violet)] text-white",
    quoteBar: "border-[var(--color-ca-violet)]",
    chipBg: "bg-[var(--color-ca-violet)]",
    reverse: false,
  },
};

function ProgramaDetalle({ d }: { d: Detalle }) {
  const t = themeMap[d.theme];
  const img = IMG[d.imgKey];

  return (
    <section
      id={d.id}
      className={`relative scroll-mt-24 overflow-hidden py-24 sm:py-28 ${t.section}`}
    >
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div
          className={`grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16 ${
            t.reverse ? "lg:[&>*:first-child]:order-2" : ""
          }`}
        >
          {/* Foto contextual */}
          <div className="relative">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] shadow-[0_30px_80px_rgba(20,22,58,0.18)]">
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="(min-width: 1024px) 480px, 100vw"
                className="object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[var(--color-ca-violet)]/35 via-transparent to-transparent mix-blend-multiply" />
            </div>
            <div
              className={`absolute -bottom-5 -right-5 hidden rounded-2xl px-5 py-3 shadow-[0_18px_36px_rgba(20,22,58,0.16)] sm:block ${t.chipBg}`}
            >
              <p
                className={`text-[10px] font-bold uppercase tracking-[0.22em] ${
                  d.theme === "violet" ? "text-white/80" : "text-[var(--color-ca-ink)]/70"
                }`}
              >
                {d.badge}
              </p>
              <p
                className={`mt-1 text-base font-black ${
                  d.theme === "violet" ? "text-white" : "text-[var(--color-ca-ink)]"
                }`}
              >
                Capital Academy
              </p>
            </div>
          </div>

          <div>
            <span
              className={`inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.28em] ${t.badge}`}
            >
              {d.badge}
            </span>
            <h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
              {d.title}
            </h2>
            <p className="mt-5 text-lg font-semibold text-[var(--color-ca-violet)] sm:text-xl">
              {d.subtitle}
            </p>
            <p className="mt-5 text-base leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-lg">
              {d.description}
            </p>

            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              <div className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6">
                <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
                  Para quiénes
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {d.audience.map((a) => (
                    <li
                      key={a}
                      className="flex gap-3 text-sm text-[var(--color-ca-ink)]"
                    >
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ca-violet)]" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6">
                <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
                  Qué desarrolla
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {d.develops.map((m) => (
                    <li
                      key={m}
                      className="flex gap-3 text-sm text-[var(--color-ca-ink)]"
                    >
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ca-lime-deep)]" />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <blockquote
              className={`mt-10 rounded-3xl border-l-4 bg-white px-6 py-6 shadow-[0_18px_40px_rgba(20,22,58,0.06)] ${t.quoteBar}`}
            >
              <p className="text-base font-semibold leading-snug text-[var(--color-ca-ink)] sm:text-lg">
                “{d.highlight}”
              </p>
            </blockquote>

            <div className="mt-8">
              <a
                href="#contacto"
                className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-8 text-sm font-bold uppercase tracking-[0.15em] text-white shadow-[0_12px_32px_rgba(94,23,235,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)]"
              >
                {d.cta}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DetalleProgramas() {
  return (
    <>
      {detalles.map((d) => (
        <ProgramaDetalle key={d.id} d={d} />
      ))}
    </>
  );
}
