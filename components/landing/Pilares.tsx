const pilares = [
  {
    title: "Criterio comercial e inmobiliario",
    desc: "Lectura del mercado, análisis del cliente y propuesta de valor real.",
  },
  {
    title: "Dominio técnico aplicado",
    desc: "Marco regulatorio, contratos, valorización y debida diligencia.",
  },
  {
    title: "Venta consultiva y asesoría profesional",
    desc: "Diagnóstico antes que pitch. Confianza antes que urgencia.",
  },
  {
    title: "Liderazgo y desarrollo de equipos",
    desc: "Construir, motivar y sostener equipos comerciales de alto nivel.",
  },
  {
    title: "Tecnología, datos e IA",
    desc: "Herramientas digitales y analítica al servicio del negocio.",
  },
  {
    title: "Ética, confianza y experiencia cliente",
    desc: "El estándar profesional que la industria necesita hoy.",
  },
  {
    title: "Conexión real con la industria",
    desc: "Casos, redes y oportunidades dentro del ecosistema Capital.",
  },
];

export function Pilares() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-ca-navy-deep)] py-24 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-32 h-[520px] w-[520px] brand-circle-lime opacity-90"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 bottom-0 h-96 w-96 brand-circle-violet opacity-50 blur-3xl"
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-lime)]">
              Pilares formativos
            </p>
            <h2 className="text-4xl font-black leading-[1.02] tracking-[-0.03em] text-white sm:text-5xl md:text-6xl lg:text-7xl">
              Los 7 pilares que sostienen la{" "}
              <span className="text-[var(--color-ca-lime)]">
                formación Capital
              </span>
            </h2>
          </div>
          <p className="text-base leading-relaxed text-white/80 sm:text-lg">
            Diseñamos programas conectados con los desafíos reales del negocio
            inmobiliario, combinando conocimiento técnico, formación comercial,
            liderazgo y experiencia aplicada.
          </p>
        </div>

        <ul className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pilares.map((p, idx) => (
            <li
              key={p.title}
              className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-[var(--color-ca-lime)]/60 hover:bg-white/[0.07]"
            >
              <div className="flex items-start justify-between">
                <span className="text-5xl font-black leading-none text-[var(--color-ca-lime)]">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="mt-2 h-px w-10 bg-white/30 transition-all group-hover:w-16 group-hover:bg-[var(--color-ca-lime)]" />
              </div>
              <h3 className="mt-6 text-lg font-bold leading-snug text-white sm:text-xl">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                {p.desc}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
