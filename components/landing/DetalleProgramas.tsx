import Image from "next/image";
import {
  PROGRAMS_LIST,
  themeStyles,
  type ProgramMeta,
} from "@/lib/landing/programs";
import { Syllabus } from "./Syllabus";

function MetaItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-[rgba(20,22,58,0.08)] py-3 last:border-b-0">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-ca-violet)]/10 text-[var(--color-ca-violet)]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-ca-ink-soft)]">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-[var(--color-ca-ink)]">
          {value}
        </p>
      </div>
    </div>
  );
}

const Icons = {
  level: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M3 18l6-6 4 4 8-8" />
      <path d="M14 8h7v7" />
    </svg>
  ),
  duration: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  modules: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  modality: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
  certificate: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="9" r="6" />
      <path d="M9 14l-2 7 5-3 5 3-2-7" />
    </svg>
  ),
  start: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
};

function ProgramaDetalle({ d }: { d: ProgramMeta }) {
  const t = themeStyles[d.theme];
  const reverse = d.theme === "violet";

  return (
    <section
      id={`detalle-${d.id}`}
      className={`relative scroll-mt-24 py-24 sm:py-28 ${t.section}`}
    >
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <div
          className={`grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start lg:gap-16 ${
            reverse ? "lg:[&>*:first-child]:order-2" : ""
          }`}
        >
          {/* Visual: brochure HERO del programa (gpt-image-2, incluye branding + título + CTA visible) */}
          <div className="relative lg:self-stretch">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] shadow-[0_30px_80px_rgba(20,22,58,0.18)]">
              <Image
                src={d.heroImage.src}
                alt={d.heroImage.alt}
                fill
                sizes="(min-width: 1024px) 480px, 100vw"
                className="object-cover"
              />
            </div>

            {/* Metadata sidebar — estilo Platzi */}
            <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-[rgba(20,22,58,0.08)] bg-white shadow-[0_18px_40px_rgba(20,22,58,0.06)] lg:sticky lg:top-24">
              {/* Banner urgencia — Próxima cohorte */}
              <div className="flex items-center gap-3 border-b border-[rgba(20,22,58,0.08)] bg-gradient-to-r from-[var(--color-ca-violet)]/[0.06] to-[var(--color-ca-lime)]/[0.08] px-5 py-4">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-ca-lime-deep)] opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-ca-lime-deep)]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ca-violet)]">
                    Próxima cohorte
                  </p>
                  <p className="text-sm font-bold text-[var(--color-ca-ink)]">
                    {d.nextStart} <span className="font-semibold text-[var(--color-ca-ink-soft)]">· {d.cohortSize}</span>
                  </p>
                </div>
              </div>

              <div className="p-5">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ca-violet)]">
                  Detalles del programa
                </p>
                <MetaItem label="Nivel" value={d.level} icon={Icons.level} />
                <MetaItem label="Duración" value={d.duration} icon={Icons.duration} />
                <MetaItem
                  label="Módulos"
                  value={`${d.modules} módulos temáticos`}
                  icon={Icons.modules}
                />
                <MetaItem label="Modalidad" value={d.modality} icon={Icons.modality} />
                <MetaItem
                  label="Certificación"
                  value={d.certificate}
                  icon={Icons.certificate}
                />
              </div>

              {/* CTA persistente — siempre visible mientras el usuario lee */}
              <div className="space-y-2 border-t border-[rgba(20,22,58,0.08)] bg-[var(--color-ca-bg)] p-4">
                {d.discountLabel && (
                  <div className="flex items-center justify-center">
                    <span className="inline-flex items-center rounded-md bg-[var(--color-ca-lime)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-ca-ink)]">
                      {d.discountLabel}
                    </span>
                  </div>
                )}
                {d.paymentUrl ? (
                  <>
                    <a
                      href={d.paymentUrl}
                      className="flex h-11 w-full items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-5 text-[12px] font-bold uppercase tracking-[0.14em] text-white shadow-[0_10px_24px_rgba(94,23,235,0.3)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2"
                    >
                      Inscribirme ahora
                    </a>
                    <a
                      href="#contacto"
                      className="flex h-10 w-full items-center justify-center rounded-full border border-[rgba(20,22,58,0.15)] bg-white px-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-ca-ink-soft)] transition-colors hover:border-[var(--color-ca-violet)]/40 hover:text-[var(--color-ca-violet)]"
                    >
                      Antes prefiero info
                    </a>
                  </>
                ) : (
                  <a
                    href="#contacto"
                    className="flex h-11 w-full items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-5 text-[12px] font-bold uppercase tracking-[0.14em] text-white shadow-[0_10px_24px_rgba(94,23,235,0.3)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2"
                  >
                    Solicitar información
                  </a>
                )}
                <p className="text-center text-[11px] text-[var(--color-ca-ink-soft)]">
                  Cupos limitados · Respuesta en 24h
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.28em] ${t.badge}`}
              >
                {d.tag}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(20,22,58,0.12)] bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ca-ink-soft)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ca-violet)]" />
                {d.level}
              </span>
            </div>

            <h2 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-5xl md:text-6xl">
              {d.title}
            </h2>
            <p className="mt-5 text-lg font-semibold text-[var(--color-ca-violet)] sm:text-xl">
              {d.subtitle}
            </p>
            <p className="mt-5 text-base leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-lg">
              {d.description}
            </p>

            {/* Áreas que cubre — chips Platzi-style */}
            <div className="mt-6">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ca-violet)]">
                Áreas que cubre
              </p>
              <div className="flex flex-wrap gap-2">
                {d.areas.map((area) => (
                  <span
                    key={area}
                    className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold ${t.chip}`}
                  >
                    {area}
                  </span>
                ))}
              </div>
            </div>

            {/* Prueba social — exclusivo del diplomado (data-driven) */}
            {d.socialProof && d.socialProof.length > 0 && (
              <div className="mt-8 overflow-hidden rounded-3xl border border-[var(--color-ca-lime-deep)]/25 bg-gradient-to-br from-[var(--color-ca-lime)]/[0.10] to-[var(--color-ca-lime)]/[0.04] p-6">
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ca-violet)]">
                  Por qué confían en este diplomado
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                  {d.socialProof.map((s) => (
                    <div key={s.label} className="flex flex-col">
                      <span className="text-2xl font-black leading-none tracking-[-0.02em] text-[var(--color-ca-ink)] sm:text-3xl">
                        {s.value}
                      </span>
                      <span className="mt-1.5 text-[11px] font-semibold leading-snug text-[var(--color-ca-ink-soft)]">
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Horarios y sede — exclusivo del diplomado (data-driven) */}
            {(d.schedule?.length || d.location) && (
              <div className="mt-6 rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6">
                <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
                  Horarios y sede
                </h3>
                {d.schedule && d.schedule.length > 0 && (
                  <ul className="mt-4 space-y-3">
                    {d.schedule.map((s) => (
                      <li key={`${s.day}-${s.time}`} className="flex flex-wrap items-center gap-2.5 text-sm text-[var(--color-ca-ink)]">
                        <span className="font-semibold">{s.day}</span>
                        <span className="inline-flex items-center rounded-md bg-[var(--color-ca-violet)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-ca-violet)]">
                          {s.mode}
                        </span>
                        <span className="text-[var(--color-ca-ink-soft)]">{s.time}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {d.location && (
                  <div className="mt-4 flex items-start gap-2.5 border-t border-[rgba(20,22,58,0.08)] pt-4 text-sm text-[var(--color-ca-ink)]">
                    <span className="mt-0.5 text-[var(--color-ca-violet)]">{Icons.pin}</span>
                    <span>{d.location}</span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              <div className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6">
                <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
                  Para quiénes
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {d.audience.map((a) => (
                    <li key={a} className="flex gap-3 text-sm text-[var(--color-ca-ink)]">
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
                    <li key={m} className="flex gap-3 text-sm text-[var(--color-ca-ink)]">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ca-lime-deep)]" />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <Syllabus d={d} />

            {/* Lo que incluye — estilo Udemy */}
            <div className="mt-8 rounded-3xl border border-[var(--color-ca-violet)]/15 bg-gradient-to-br from-[var(--color-ca-violet)]/[0.04] to-[var(--color-ca-lime)]/[0.06] p-6">
              <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
                Lo que incluye
              </h3>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {d.includes.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm text-[var(--color-ca-ink)]"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-ca-lime)] text-[var(--color-ca-ink)]">
                      {Icons.check}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <blockquote className="mt-8 rounded-3xl border-l-4 border-[var(--color-ca-violet)] bg-white px-6 py-6 shadow-[0_18px_40px_rgba(20,22,58,0.06)]">
              <p className="text-base font-semibold leading-snug text-[var(--color-ca-ink)] sm:text-lg">
                “{d.highlight}”
              </p>
            </blockquote>

            <div className="mt-8 flex flex-wrap gap-3">
              {d.paymentUrl && (
                <a
                  href={d.paymentUrl}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-8 text-sm font-bold uppercase tracking-[0.15em] text-white shadow-[0_12px_32px_rgba(94,23,235,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2"
                >
                  Inscribirme ahora
                </a>
              )}
              <a
                href="#contacto"
                className={`inline-flex h-12 items-center justify-center rounded-full px-7 text-sm font-bold uppercase tracking-[0.15em] transition-all ${
                  d.paymentUrl
                    ? "border border-[var(--color-ca-ink)]/15 bg-white text-[var(--color-ca-ink)] hover:border-[var(--color-ca-violet)] hover:text-[var(--color-ca-violet)]"
                    : "bg-[var(--color-ca-violet)] text-white shadow-[0_12px_32px_rgba(94,23,235,0.35)] hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)]"
                } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2`}
              >
                {d.cta}
              </a>
              <a
                href="#programas"
                className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--color-ca-ink)]/15 bg-white px-7 text-sm font-bold uppercase tracking-[0.15em] text-[var(--color-ca-ink)] transition-all hover:border-[var(--color-ca-violet)] hover:text-[var(--color-ca-violet)]"
              >
                Comparar programas
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
      {PROGRAMS_LIST.map((d) => (
        <ProgramaDetalle key={d.id} d={d} />
      ))}
    </>
  );
}
