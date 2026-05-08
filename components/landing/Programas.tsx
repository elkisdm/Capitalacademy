const programas = [
  {
    id: "diplomado",
    tag: "Diplomado",
    title: "Diplomado en Ventas y Asesoría Inmobiliaria",
    desc: "Para asesores, brokers y ejecutivos comerciales que quieren vender mejor, asesorar con más solidez y elevar su nivel profesional.",
    href: "#detalle-diplomado",
    accent: "lime",
  },
  {
    id: "liderazgo",
    tag: "Programa",
    title: "Liderazgo y Gestión de Equipos Comerciales",
    desc: "Para jefaturas, líderes comerciales y profesionales que buscan construir, conducir y sostener equipos de alto desempeño.",
    href: "#detalle-liderazgo",
    accent: "lavender",
  },
  {
    id: "ruta",
    tag: "Programa",
    title: "Ruta Inmobiliaria",
    desc: "Para emprendedores y profesionales que buscan abrir una nueva etapa laboral dentro de la industria inmobiliaria, con respaldo, formación y visión de negocio.",
    href: "#detalle-ruta",
    accent: "violet",
  },
] as const;

const accentMap = {
  lime: {
    badge: "bg-[var(--color-ca-lime)] text-[var(--color-ca-ink)]",
    bar: "bg-[var(--color-ca-lime)]",
  },
  lavender: {
    badge: "bg-[var(--color-ca-violet-soft)] text-[var(--color-ca-violet-deep)]",
    bar: "bg-[var(--color-ca-violet-soft)]",
  },
  violet: {
    badge: "bg-[var(--color-ca-violet)] text-white",
    bar: "bg-[var(--color-ca-violet)]",
  },
} as const;

export function Programas() {
  return (
    <section
      id="programas"
      className="relative overflow-hidden bg-[var(--color-ca-bg)] py-24 sm:py-28"
    >
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-violet)]">
            Nuestros programas
          </p>
          <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
            Tres caminos de formación para{" "}
            <span className="text-[var(--color-ca-violet)]">
              tres etapas de desarrollo
            </span>
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-lg">
            Capital Academy cuenta con programas diseñados para distintos
            perfiles y momentos profesionales dentro de la industria
            inmobiliaria.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {programas.map((p) => {
            const a = accentMap[p.accent];
            return (
              <article
                key={p.id}
                className="group relative flex flex-col overflow-hidden rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-7 transition-all hover:-translate-y-1 hover:border-[var(--color-ca-violet)]/30 hover:shadow-[0_28px_56px_rgba(94,23,235,0.16)]"
              >
                <div className={`absolute inset-x-0 top-0 h-1.5 ${a.bar}`} />
                <span
                  className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${a.badge}`}
                >
                  {p.tag}
                </span>
                <h3 className="mt-5 text-xl font-bold leading-tight text-[var(--color-ca-ink)] sm:text-2xl">
                  {p.title}
                </h3>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">
                  {p.desc}
                </p>
                <a
                  href={p.href}
                  className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-[var(--color-ca-ink)] px-6 text-xs font-bold uppercase tracking-[0.18em] text-white transition-all group-hover:bg-[var(--color-ca-violet)]"
                >
                  Ver programa
                </a>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
