const ideas = [
  {
    title: "Mayor profesionalización",
    desc: "Eleva tu nivel con criterio, método y disciplina ejecutiva.",
  },
  {
    title: "Mejor asesoría al cliente",
    desc: "Construye confianza con dominio técnico y visión integral.",
  },
  {
    title: "Más criterio comercial e inmobiliario",
    desc: "Decisiones informadas, lectura del mercado y propuesta sólida.",
  },
  {
    title: "Liderazgo y resultados sostenibles",
    desc: "Equipos, foco y consistencia para crecer en el tiempo.",
  },
];

export function NuevoEstandar() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-ca-navy)] py-24 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-20 h-96 w-96 brand-circle-lime opacity-90"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 bottom-10 h-[420px] w-[420px] brand-circle-violet opacity-70 blur-2xl"
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-lime)]">
            El nuevo estándar
          </p>
          <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] text-white sm:text-5xl md:text-6xl">
            El nuevo estándar de la industria inmobiliaria
          </h2>
          <p className="mt-6 text-base leading-relaxed text-white/85 sm:text-lg">
            Hoy vender propiedades exige mucho más que intención comercial.
            Exige preparación, criterio, confianza, dominio del negocio y una
            mirada profesional sobre el cliente, el mercado y la inversión.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {ideas.map((i, idx) => (
            <div
              key={i.title}
              className="group relative overflow-hidden rounded-3xl border border-white/15 bg-white/[0.06] p-7 backdrop-blur-sm transition-all hover:border-[var(--color-ca-lime)] hover:bg-white/[0.1]"
            >
              <span className="text-xs font-black tracking-[0.22em] text-[var(--color-ca-lime)]">
                0{idx + 1}
              </span>
              <h3 className="mt-3 text-xl font-bold leading-snug text-white">
                {i.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                {i.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
