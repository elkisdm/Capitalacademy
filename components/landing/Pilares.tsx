const pilares = [
  "Criterio comercial e inmobiliario",
  "Dominio técnico aplicado",
  "Venta consultiva y asesoría profesional",
  "Liderazgo y desarrollo de equipos",
  "Tecnología, datos e inteligencia artificial",
  "Ética, confianza y experiencia cliente",
  "Conexión real con la industria",
];

export function Pilares() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-ca-bg)] py-24 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 top-20 h-80 w-80 brand-circle-lime opacity-30"
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-violet)]">
            Pilares formativos
          </p>
          <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
            Nuestros pilares formativos
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-lg">
            Diseñamos programas conectados con los desafíos reales del negocio
            inmobiliario, combinando conocimiento técnico, formación comercial,
            liderazgo y experiencia aplicada.
          </p>
        </div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pilares.map((p, idx) => (
            <li
              key={p}
              className="flex items-start gap-4 rounded-2xl border border-[rgba(20,22,58,0.08)] bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-[var(--color-ca-violet)]/40 hover:shadow-[0_18px_40px_rgba(94,23,235,0.12)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-ca-lime)] text-sm font-black text-[var(--color-ca-ink)]">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="pt-1.5 text-sm font-semibold leading-snug text-[var(--color-ca-ink)] sm:text-base">
                {p}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
