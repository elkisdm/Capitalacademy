import { FAQ } from "@/lib/landing/faq";

export function FAQSection() {
  return (
    <section
      id="faq"
      className="relative overflow-hidden bg-[var(--color-ca-bg)] py-24 sm:py-28"
    >
      <div className="relative z-10 mx-auto max-w-4xl px-6">
        <div className="text-center">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-violet)]">
            Preguntas frecuentes
          </p>
          <h2 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
            Lo que más nos{" "}
            <span className="text-[var(--color-ca-violet)]">preguntan</span>
          </h2>
          <p className="mt-6 text-base leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-lg">
            Si tienes una duda que no aparece acá, escríbenos por el formulario
            o por WhatsApp y te respondemos directo.
          </p>
        </div>

        <ul className="mt-12 space-y-3">
          {FAQ.map((item, idx) => (
            <li key={item.q}>
              <details className="group rounded-2xl border border-[rgba(20,22,58,0.08)] bg-white transition-colors open:border-[var(--color-ca-violet)]/30 open:bg-white">
                <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-5 [&::-webkit-details-marker]:hidden sm:px-6">
                  <span className="text-xs font-black tabular-nums text-[var(--color-ca-violet)]">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-base font-bold leading-snug text-[var(--color-ca-ink)] sm:text-lg">
                    {item.q}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 shrink-0 text-[var(--color-ca-violet)] transition-transform group-open:rotate-45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </summary>
                <p className="px-5 pb-6 text-sm leading-relaxed text-[var(--color-ca-ink-soft)] sm:px-6 sm:text-base">
                  <span className="ml-9 block">{item.a}</span>
                </p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
