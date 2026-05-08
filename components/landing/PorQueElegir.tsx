const razones = [
  "Formación creada desde la experiencia real del negocio inmobiliario.",
  "Docentes y profesionales activos en la industria.",
  "Programas aplicados, no solo teóricos.",
  "Conexión con el ecosistema de Capital Inteligente.",
  "Foco en criterio, profesionalización y resultados sostenibles.",
];

export function PorQueElegir() {
  return (
    <section
      id="por-que"
      className="relative overflow-hidden bg-[var(--color-ca-bg)] py-24 sm:py-28"
    >
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-violet)]">
            Por qué elegir Capital Academy
          </p>
          <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
            ¿Por qué elegir Capital Academy?
          </h2>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {razones.map((r, i) => (
            <div
              key={r}
              className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-7 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(94,23,235,0.1)]"
            >
              <span className="text-3xl font-black text-[var(--color-ca-violet)]">
                0{i + 1}
              </span>
              <p className="mt-3 text-sm font-semibold leading-snug text-[var(--color-ca-ink)] sm:text-base">
                {r}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
