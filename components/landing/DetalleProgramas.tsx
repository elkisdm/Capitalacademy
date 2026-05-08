type Theme = "lime" | "lavender" | "violet";

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
};

const detalles: Detalle[] = [
  {
    id: "detalle-diplomado",
    badge: "Diplomado",
    title: "Diplomado en Ventas y Asesoría Inmobiliaria",
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
  },
  {
    id: "detalle-liderazgo",
    badge: "Liderazgo",
    title: "Programa de Liderazgo y Gestión de Equipos Comerciales",
    subtitle:
      "Herramientas para construir, liderar y sostener equipos que estén a la altura de grandes metas.",
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
    highlight: "Cuando el desafío actual deja de crecer, puede comenzar una nueva etapa.",
    cta: "Quiero información de Ruta Inmobiliaria",
    theme: "violet",
  },
];

const themeMap: Record<Theme, { section: string; badge: string; chip: string; quoteBar: string }> = {
  lime: {
    section: "bg-[var(--color-ca-bg)]",
    badge: "bg-[var(--color-ca-lime)] text-[var(--color-ca-ink)]",
    chip: "bg-[var(--color-ca-lime)]/15 text-[var(--color-ca-violet-deep)] border-[var(--color-ca-lime)]",
    quoteBar: "border-[var(--color-ca-lime)]",
  },
  lavender: {
    section: "bg-[var(--color-ca-violet-soft)]",
    badge: "bg-[var(--color-ca-violet)] text-white",
    chip: "bg-white text-[var(--color-ca-violet-deep)] border-white",
    quoteBar: "border-[var(--color-ca-violet)]",
  },
  violet: {
    section: "bg-[var(--color-ca-bg)]",
    badge: "bg-[var(--color-ca-violet)] text-white",
    chip: "bg-[var(--color-ca-violet)]/10 text-[var(--color-ca-violet-deep)] border-[var(--color-ca-violet)]/30",
    quoteBar: "border-[var(--color-ca-violet)]",
  },
};

function ProgramaDetalle({ d }: { d: Detalle }) {
  const t = themeMap[d.theme];
  return (
    <section
      id={d.id}
      className={`relative scroll-mt-24 overflow-hidden py-24 sm:py-28 ${t.section}`}
    >
      <div className="relative z-10 mx-auto max-w-5xl px-6">
        <span
          className={`inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.28em] ${t.badge}`}
        >
          {d.badge}
        </span>
        <h2 className="mt-5 text-4xl font-black leading-[1.05] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
          {d.title}
        </h2>
        <p className="mt-5 text-lg font-semibold text-[var(--color-ca-violet)] sm:text-xl">
          {d.subtitle}
        </p>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-lg">
          {d.description}
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-7">
            <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
              Para quiénes
            </h3>
            <ul className="mt-5 space-y-3">
              {d.audience.map((a) => (
                <li key={a} className="flex gap-3 text-sm text-[var(--color-ca-ink)]">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ca-violet)]" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-7">
            <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
              Qué desarrolla
            </h3>
            <ul className="mt-5 space-y-3">
              {d.develops.map((m) => (
                <li key={m} className="flex gap-3 text-sm text-[var(--color-ca-ink)]">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ca-lime-deep)]" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <blockquote
          className={`mt-12 rounded-3xl border-l-4 bg-white px-7 py-7 shadow-[0_18px_40px_rgba(20,22,58,0.06)] ${t.quoteBar}`}
        >
          <p className="text-lg font-semibold leading-snug text-[var(--color-ca-ink)] sm:text-xl">
            “{d.highlight}”
          </p>
        </blockquote>

        <div className="mt-10">
          <a
            href="#contacto"
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-8 text-sm font-bold uppercase tracking-[0.15em] text-white shadow-[0_12px_32px_rgba(94,23,235,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)]"
          >
            {d.cta}
          </a>
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
