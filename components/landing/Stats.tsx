const stats = [
  {
    kpi: "3",
    label: "Programas formativos",
    detail: "Diplomado, Liderazgo y Ruta Inmobiliaria.",
  },
  {
    kpi: "7",
    label: "Pilares aplicados",
    detail: "Criterio, técnica, asesoría, liderazgo, datos, ética y red.",
  },
  {
    kpi: "100%",
    label: "Conexión real",
    detail: "Docentes activos en la industria inmobiliaria.",
  },
  {
    kpi: "1",
    label: "Ecosistema",
    detail: "Respaldo directo de Capital Inteligente.",
  },
];

export function Stats() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-ca-lime)]">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-ink)]/70">
          Capital Academy en números
        </p>
        <h2 className="max-w-3xl text-3xl font-black leading-[1.05] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-4xl md:text-5xl">
          Una propuesta enfocada, aplicada y conectada con la industria.
        </h2>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="border-t-2 border-[var(--color-ca-ink)]/30 pt-5"
            >
              <div className="text-6xl font-black leading-none tracking-[-0.04em] text-[var(--color-ca-ink)] sm:text-7xl">
                {s.kpi}
              </div>
              <p className="mt-4 text-sm font-bold uppercase tracking-[0.16em] text-[var(--color-ca-ink)]">
                {s.label}
              </p>
              <p className="mt-2 text-sm leading-snug text-[var(--color-ca-ink)]/75">
                {s.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
