import Image from "next/image";
import Link from "next/link";
import { RotadorFotos } from "@/components/landing/liderazgo/RotadorFotos";
import { Reveal } from "@/components/landing/liderazgo/Reveal";
import { DIPLOMADO } from "@/lib/landing/diplomado";
import { FormularioDiplomado } from "./FormularioDiplomado";

/* Landing del Diplomado (5ª generación, ago-2026): misma familia visual que
   la de Liderazgo — fotos reales, verde lima de marca como acento y bandas
   full-image — con el contenido del CSV "Estructura Landing - Diplomado".
   Las fotos son de la sesión oficial de la Academia (clases y graduación),
   compartidas con /liderazgo. */

const HERO_GRADIENT_MOBILE =
  "linear-gradient(180deg, color-mix(in srgb, var(--color-ca-navy-ink) 20%, transparent) 0%, color-mix(in srgb, var(--color-ca-navy-ink) 55%, transparent) 45%, color-mix(in srgb, var(--color-ca-navy-ink) 94%, transparent) 100%)";
const HERO_GRADIENT_DESKTOP =
  "linear-gradient(90deg, color-mix(in srgb, var(--color-ca-navy-ink) 92%, transparent) 0%, color-mix(in srgb, var(--color-ca-navy-ink) 78%, transparent) 38%, color-mix(in srgb, var(--color-ca-navy-ink) 25%, transparent) 72%, color-mix(in srgb, var(--color-ca-navy-ink) 5%, transparent) 100%)";
const BANDA_GRADIENT_MOBILE =
  "linear-gradient(180deg, color-mix(in srgb, var(--color-ca-navy-ink) 0%, transparent) 25%, color-mix(in srgb, var(--color-ca-navy-ink) 85%, transparent) 100%)";
const BANDA_GRADIENT_DESKTOP =
  "linear-gradient(180deg, color-mix(in srgb, var(--color-ca-navy-ink) 0%, transparent) 30%, color-mix(in srgb, var(--color-ca-navy-ink) 85%, transparent) 100%)";

const ctaLimeLg =
  "inline-flex h-[52px] w-full items-center justify-center rounded-full bg-[var(--color-ca-lime)] px-8 text-[15px] font-extrabold tracking-[0.02em] text-[var(--color-ca-ink)] transition-colors hover:bg-[var(--color-ca-lime-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-lime-deep)]/50 focus-visible:ring-offset-2 sm:w-auto";

const ctaLimeMd =
  "inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ca-lime)] px-7 text-sm font-extrabold tracking-[0.02em] text-[var(--color-ca-ink)] transition-colors hover:bg-[var(--color-ca-lime-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-lime-deep)]/50 focus-visible:ring-offset-2";

const ctaLimeSm =
  "inline-flex h-11 items-center justify-center rounded-full bg-[var(--color-ca-lime)] px-5 text-xs font-extrabold tracking-[0.04em] text-[var(--color-ca-ink)] transition-colors hover:bg-[var(--color-ca-lime-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-lime-deep)]/50";

const ctaOutlineOnDark =
  "inline-flex h-[52px] w-full items-center justify-center rounded-full border-[1.5px] border-white/50 px-8 text-[15px] font-bold text-white transition-colors hover:border-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:w-auto";

const ctaOutlineNavy =
  "inline-flex h-12 w-full items-center justify-center rounded-full border-[1.5px] border-[var(--color-ca-navy-ink)]/40 px-7 text-sm font-bold text-[var(--color-ca-navy-ink)] transition-colors hover:border-[var(--color-ca-navy-ink)] hover:bg-[var(--color-ca-navy-ink)]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-navy-ink)]/30 sm:w-auto";

const ctaOutlineLime =
  "inline-flex h-11 items-center justify-center rounded-full border-[1.5px] border-[var(--color-ca-lime)] px-6 text-[13px] font-bold text-[var(--color-ca-lime)] transition-colors hover:bg-[var(--color-ca-lime)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-lime)]/40";

function Kicker({
  num,
  label,
  tone = "onLight",
}: {
  num: string;
  label: string;
  tone?: "onLight" | "onDark";
}) {
  return (
    <p
      className={`text-[11px] font-bold uppercase tracking-[0.28em] sm:text-xs ${
        tone === "onDark"
          ? "text-[var(--color-ca-lime)]"
          : "text-[var(--color-ca-lime-text)]"
      }`}
    >
      <span className="tabular-nums">{num}</span>
      <span aria-hidden className="mx-2 opacity-60">
        —
      </span>
      {label}
    </p>
  );
}

function Check() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-ca-lime-deep)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function HeaderDiplomado() {
  return (
    <header className="sticky top-0 z-40 flex h-[60px] items-center justify-between border-b border-[var(--color-ca-outline)] bg-[var(--color-ca-surface)]/95 px-5 backdrop-blur sm:h-[76px] sm:px-8 lg:px-16">
      <Link
        href="/"
        className="flex items-center gap-3 self-stretch rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-lime-deep)]/50"
      >
        <Image
          src="/brand/logo-on-light.png"
          alt=""
          width={36}
          height={35}
          className="h-8 w-8 sm:h-9 sm:w-[35px]"
          priority
        />
        <span className="text-[13px] font-bold tracking-[0.02em] text-[var(--color-ca-ink)] sm:text-[15px]">
          Capital Academy
          <span className="ml-3.5 hidden border-l border-[var(--color-ca-outline-strong)] pl-3.5 font-medium text-[var(--color-ca-ink-soft)] sm:inline">
            Diplomado Ejecutivo
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-7">
        <nav className="hidden items-center gap-7 lg:flex">
          <a
            href="#programa"
            className="text-[13px] font-semibold text-[var(--color-ca-ink-soft)] transition-colors hover:text-[var(--color-ca-ink)]"
          >
            El programa
          </a>
          <a
            href="#cursos"
            className="text-[13px] font-semibold text-[var(--color-ca-ink-soft)] transition-colors hover:text-[var(--color-ca-ink)]"
          >
            Cursos
          </a>
          <a
            href="#practica"
            className="text-[13px] font-semibold text-[var(--color-ca-ink-soft)] transition-colors hover:text-[var(--color-ca-ink)]"
          >
            Modalidad
          </a>
        </nav>
        <a href="#inscripcion" className={ctaLimeSm}>
          Inscribirme
        </a>
      </div>
    </header>
  );
}

export function HeroDiplomado() {
  const h = DIPLOMADO.hero;
  return (
    <section className="relative flex min-h-[600px] items-end overflow-hidden sm:min-h-[640px] lg:min-h-[680px] lg:items-center">
      <RotadorFotos
        fotos={[
          { src: "/landing/liderazgo/clase.jpg", alt: "Clase presencial del Diplomado de Capital Academy" },
          { src: "/landing/liderazgo/hero-2.jpg", alt: "Docente presentando en una sesión del Diplomado" },
          { src: "/landing/liderazgo/clase-3.jpg", alt: "Alumnos en una clase presencial" },
        ]}
        priority
        intervaloMs={7000}
        sizes="100vw"
        className="object-cover object-[62%_30%] lg:object-[center_35%]"
      />
      <div
        aria-hidden
        className="absolute inset-0 lg:hidden"
        style={{ background: HERO_GRADIENT_MOBILE }}
      />
      <div
        aria-hidden
        className="absolute inset-0 hidden lg:block"
        style={{ background: HERO_GRADIENT_DESKTOP }}
      />
      <div className="ca-fade-up relative flex max-w-[800px] flex-col gap-5 px-5 py-12 sm:px-8 sm:py-14 lg:gap-[26px] lg:px-16 lg:py-0">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-[3px] w-6 bg-[var(--color-ca-lime)] lg:w-7" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ca-lime)] sm:text-xs lg:tracking-[0.24em]">
            {h.kicker}
          </span>
        </div>
        <h1 className="text-balance text-[30px] font-extrabold leading-[1.12] tracking-[-0.02em] text-white sm:text-[44px] lg:text-[52px] lg:leading-[1.07]">
          {h.titulo}
        </h1>
        <p className="max-w-[600px] text-[15px] leading-relaxed text-white/85 sm:text-base lg:text-[18px]">
          {h.bajada}
        </p>
        <ul className="flex flex-wrap gap-2 lg:gap-3">
          {h.meta.map((m) => (
            <li
              key={m}
              className="flex items-center gap-2 rounded-full border border-white/35 px-3 py-1.5 lg:px-4 lg:py-2"
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--color-ca-lime)]" />
              <span className="text-[11px] font-semibold text-white lg:text-[13px]">{m}</span>
            </li>
          ))}
        </ul>
        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--color-ca-lime)] sm:text-sm">
          {h.aviso}
        </p>
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:gap-4">
          <a href="#inscripcion" className={ctaLimeLg}>
            {h.cta}
          </a>
          <a href="#programa" className={ctaOutlineOnDark}>
            Ver el programa
          </a>
        </div>
        <p className="text-xs text-white/60">
          Sin compromiso: te contactamos con la información completa del programa.
        </p>
      </div>
    </section>
  );
}

export function CambioIndustria() {
  const c = DIPLOMADO.cambio;
  return (
    <section
      id="programa"
      className="scroll-mt-20 border-b border-[var(--color-ca-outline)] bg-[var(--color-ca-surface)] px-5 py-16 sm:px-8 lg:px-16 lg:py-[88px]"
    >
      <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-2 lg:items-center lg:gap-16">
        <Reveal className="flex flex-col gap-6">
          <Kicker num="01" label="El programa" />
          <h2 className="text-balance text-2xl font-bold leading-tight tracking-[-0.02em] text-[var(--color-ca-navy-ink)] sm:text-[32px] lg:text-[34px]">
            {c.titulo}
          </h2>
          {c.parrafos.map((p) => (
            <p key={p} className="text-[15px] leading-relaxed text-[var(--color-ca-ink-soft)] lg:text-base">
              {p}
            </p>
          ))}
          <p className="border-l-[3px] border-[var(--color-ca-lime)] pl-[18px] text-[15px] font-semibold leading-relaxed text-[var(--color-ca-ink)]">
            {c.destacado}
          </p>
          <div className="pt-1">
            <a href="#cursos" className={ctaOutlineNavy}>
              {c.cta}
            </a>
          </div>
        </Reveal>
        <div className="relative mb-8 lg:mb-0">
          <div className="relative aspect-[3/2] overflow-hidden rounded-2xl">
            <RotadorFotos
              fotos={[
                { src: "/landing/liderazgo/mesa.jpg", alt: "Trabajo sobre casos reales en clase" },
                { src: "/landing/liderazgo/conversacion.jpg", alt: "Conversación comercial de práctica" },
                { src: "/landing/liderazgo/mesa-3.jpg", alt: "Alumnos trabajando en equipo" },
              ]}
              intervaloMs={6500}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          <div className="absolute -bottom-5 left-5 flex flex-col gap-0.5 rounded-2xl bg-[var(--color-ca-lime)] px-5 py-4 shadow-[0_12px_30px_rgba(15,19,64,0.18)] sm:left-6">
            <span className="text-lg font-extrabold text-[var(--color-ca-ink)] sm:text-[22px]">
              De vendedor a asesor
            </span>
            <span className="text-[13px] font-semibold text-[var(--color-ca-lime-text)]">
              con criterio financiero y método
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Cursos() {
  const p = DIPLOMADO.programa;
  return (
    <section
      id="cursos"
      className="scroll-mt-20 bg-[var(--color-ca-bg)] px-5 py-16 sm:px-8 lg:px-16 lg:py-[88px]"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-8 lg:gap-11">
        <div className="flex max-w-3xl flex-col gap-3">
          <Kicker num="02" label="Cuatro cursos" />
          <h2 className="text-balance text-[22px] font-bold leading-snug tracking-[-0.02em] text-[var(--color-ca-navy-ink)] sm:text-[28px] lg:text-[30px]">
            {p.titulo}
          </h2>
          <p className="text-[15px] leading-relaxed text-[var(--color-ca-ink-soft)]">{p.intro}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {p.cursos.map((c, i) => (
            <Reveal key={c.num} delayMs={i * 90}>
              <div className="flex h-full flex-col gap-3.5 rounded-2xl bg-[var(--color-ca-surface)] p-7 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(15,19,64,0.10)]">
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-extrabold leading-none text-[var(--color-ca-lime-deep)]">
                    {String(c.num).padStart(2, "0")}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-ca-ink-soft)]">
                    Curso {c.num}
                  </span>
                </div>
                <h3 className="text-[19px] font-bold text-[var(--color-ca-navy-ink)]">{c.titulo}</h3>
                <p className="text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">{c.detalle}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="flex justify-center lg:justify-start">
          <a href="#inscripcion" className={ctaLimeMd}>
            {p.cta}
          </a>
        </div>
      </div>
    </section>
  );
}

export function BandaClase() {
  return (
    <section className="relative flex h-[240px] items-end overflow-hidden sm:h-[320px] lg:h-[420px]">
      <RotadorFotos
        fotos={[
          { src: "/landing/liderazgo/clase-2.jpg", alt: "Docente frente a una generación completa" },
          { src: "/landing/liderazgo/hero.jpg", alt: "Clase ejecutiva de Capital Academy" },
        ]}
        intervaloMs={7500}
        sizes="100vw"
        className="object-cover object-[center_40%]"
      />
      <div aria-hidden className="absolute inset-0 lg:hidden" style={{ background: BANDA_GRADIENT_MOBILE }} />
      <div
        aria-hidden
        className="absolute inset-0 hidden lg:block"
        style={{ background: BANDA_GRADIENT_DESKTOP }}
      />
      <Reveal className="relative flex w-full flex-col gap-5 px-5 pb-8 sm:px-8 sm:pb-10 lg:flex-row lg:items-end lg:justify-between lg:px-16 lg:pb-12">
        <p className="max-w-[640px] text-lg font-bold leading-snug tracking-[-0.01em] text-white sm:text-2xl lg:text-[28px]">
          Hoy el mercado no necesita más vendedores de proyectos. Necesita asesores de inversión con criterio real.
        </p>
        <a href="#inscripcion" className={`${ctaLimeMd} w-full lg:w-auto lg:shrink-0`}>
          Quiero saber más
        </a>
      </Reveal>
    </section>
  );
}

export function PracticaReal() {
  const p = DIPLOMADO.practica;
  return (
    <section
      id="practica"
      className="scroll-mt-20 border-b border-[var(--color-ca-outline)] bg-[var(--color-ca-surface)] px-5 py-16 sm:px-8 lg:px-16 lg:py-[88px]"
    >
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[5fr_7fr] lg:items-center lg:gap-16">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl sm:aspect-[3/2] lg:order-1">
          <RotadorFotos
            fotos={[
              { src: "/landing/liderazgo/conversacion-2.jpg", alt: "Práctica de conversación comercial" },
              { src: "/landing/liderazgo/mesa-2.jpg", alt: "Jornada práctica presencial" },
              { src: "/landing/liderazgo/oficina.jpg", alt: "Trabajo individual del asesor" },
            ]}
            intervaloMs={8000}
            sizes="(min-width: 1024px) 42vw, 100vw"
            className="object-cover"
          />
        </div>
        <Reveal className="flex flex-col gap-6 lg:order-2">
          <Kicker num="03" label="Modalidad" />
          <h2 className="text-2xl font-bold leading-tight tracking-[-0.02em] text-[var(--color-ca-navy-ink)] sm:text-[28px] lg:text-[30px]">
            {p.titulo}
          </h2>
          <p className="text-[15px] leading-relaxed text-[var(--color-ca-ink-soft)]">{p.intro}</p>
          <dl className="overflow-hidden rounded-2xl bg-[var(--color-ca-bg)]">
            {p.horarios.map((h) => (
              <div
                key={h.dia}
                className="grid gap-1 border-b border-[var(--color-ca-outline)] px-5 py-4 last:border-b-0 sm:grid-cols-[200px_1fr] sm:items-baseline sm:gap-4 sm:px-6"
              >
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-ca-ink-soft)]">
                  {h.dia}
                </dt>
                <dd className="text-sm font-semibold leading-relaxed text-[var(--color-ca-ink)]">
                  {h.hora}
                </dd>
              </div>
            ))}
          </dl>
          <p className="border-l-[3px] border-[var(--color-ca-lime)] pl-[18px] text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">
            {p.detalle}
          </p>
          <div>
            <a href="#cursos" className={ctaOutlineNavy}>
              {p.cta}
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Respaldo() {
  const r = DIPLOMADO.respaldo;
  return (
    <section className="bg-[var(--color-ca-bg)] px-5 py-16 sm:px-8 lg:px-16 lg:py-[88px]">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 lg:gap-12">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-4">
          <Kicker num="04" label="Respaldo" />
          <h2 className="text-[22px] font-bold tracking-[-0.02em] text-[var(--color-ca-navy-ink)] sm:text-[28px] lg:text-[30px]">
            {r.titulo}
          </h2>
        </div>
        <Reveal>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {r.cifras.map((c) => (
              <li
                key={c.label}
                className="flex flex-col gap-2 rounded-b-2xl border-t-[3px] border-[var(--color-ca-lime)] bg-[var(--color-ca-surface)] p-6"
              >
                <span className="text-balance text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--color-ca-navy-ink)] sm:text-[30px]">
                  {c.valor}
                </span>
                <span className="text-[13px] font-semibold leading-snug text-[var(--color-ca-ink-soft)]">
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal className="flex flex-col gap-5 rounded-2xl bg-[var(--color-ca-navy-ink)] px-6 py-8 sm:px-10 sm:py-10 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <p className="flex items-start gap-3 text-balance text-lg font-bold leading-snug text-white sm:text-[22px] lg:max-w-[640px]">
            <Check />
            <span>{r.cierre}</span>
          </p>
          <a href="#inscripcion" className={`${ctaLimeMd} w-full lg:w-auto lg:shrink-0`}>
            {r.cta}
          </a>
        </Reveal>
      </div>
    </section>
  );
}

export function Inscripcion() {
  const f = DIPLOMADO.formulario;
  return (
    <section
      id="inscripcion"
      className="scroll-mt-20 bg-[var(--color-ca-navy-ink)] px-5 py-16 sm:px-8 lg:px-16 lg:py-[88px]"
    >
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[5fr_7fr] lg:items-start lg:gap-16">
        <div className="flex flex-col gap-5 lg:sticky lg:top-28 lg:gap-[22px]">
          <Kicker num="05" label="Inscripción" tone="onDark" />
          <h2 className="text-2xl font-bold leading-tight tracking-[-0.02em] text-white sm:text-[32px] lg:text-[34px]">
            {f.titulo}
          </h2>
          <p className="text-[15px] leading-relaxed text-white/75">{f.intro}</p>
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--color-ca-lime)]">
            {DIPLOMADO.hero.aviso}
          </p>
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-ca-lime)]/35 px-5 py-4">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-[22px] w-[22px] shrink-0 text-[var(--color-ca-lime)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-[13px] leading-relaxed text-white/75">{f.consentimiento}</span>
          </div>
        </div>
        <FormularioDiplomado cta={f.cta} />
      </div>
    </section>
  );
}

export function BandaGraduacion() {
  return (
    <section className="relative flex h-[360px] items-center justify-center overflow-hidden sm:h-[420px] lg:h-[460px]">
      <RotadorFotos
        fotos={[
          { src: "/landing/liderazgo/graduacion.jpg", alt: "Graduación de una generación del Diplomado" },
          { src: "/landing/liderazgo/graduacion-2.jpg", alt: "Entrega de diplomas de una generación" },
          { src: "/landing/liderazgo/graduacion-3.jpg", alt: "Celebración de cierre de una generación" },
        ]}
        intervaloMs={7000}
        sizes="100vw"
        className="object-cover object-[center_32%]"
      />
      <div aria-hidden className="absolute inset-0 bg-[var(--color-ca-navy-ink)]/72" />
      <Reveal className="relative flex max-w-[820px] flex-col items-center gap-6 px-6 text-center sm:gap-[26px]">
        <h2 className="text-balance text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-[34px] lg:text-[40px]">
          Eleva tu estándar. Asesora con criterio.
        </h2>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--color-ca-lime)]">
          {DIPLOMADO.hero.aviso}
        </p>
        <a href="#inscripcion" className={ctaLimeLg}>
          Quiero inscribirme
        </a>
      </Reveal>
    </section>
  );
}

export function FooterDiplomado() {
  return (
    <footer className="bg-[var(--color-ca-navy-ink)]">
      <div className="mx-auto grid max-w-6xl gap-10 border-b border-white/10 px-5 py-14 sm:px-8 lg:grid-cols-[4fr_2fr_2fr_3fr] lg:gap-12 lg:px-16 lg:py-16">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Image src="/brand/logo-light.png" alt="" width={40} height={40} className="h-10 w-10" />
            <span className="text-base font-bold text-white">Capital Academy</span>
          </div>
          <p className="max-w-[300px] text-[13px] leading-relaxed text-white/60">
            Formación aplicada para la industria inmobiliaria.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--color-ca-lime)]">
            Diplomado
          </span>
          <a href="#programa" className="py-2 text-[13px] font-medium text-white/75 hover:text-white">
            El programa
          </a>
          <a href="#cursos" className="py-2 text-[13px] font-medium text-white/75 hover:text-white">
            Cursos
          </a>
          <a href="#practica" className="py-2 text-[13px] font-medium text-white/75 hover:text-white">
            Modalidad
          </a>
          <a href="#inscripcion" className="py-2 text-[13px] font-medium text-white/75 hover:text-white">
            Inscripción
          </a>
        </div>
        <div className="flex flex-col gap-1">
          <span className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--color-ca-lime)]">
            Academia
          </span>
          <Link href="/liderazgo" className="py-2 text-[13px] font-medium text-white/75 hover:text-white">
            Programa de Liderazgo
          </Link>
          <Link href="/" className="py-2 text-[13px] font-medium text-white/75 hover:text-white">
            capitalacademy.cl
          </Link>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[var(--color-ca-lime)]">
            Contacto
          </span>
          <a
            href="mailto:academia@capitalacademy.cl"
            className="flex items-center gap-2.5 py-2 text-[13px] font-medium text-white/75 hover:text-white"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="var(--color-ca-lime)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            academia@capitalacademy.cl
          </a>
          <a href="#inscripcion" className={`${ctaOutlineLime} mt-1.5`}>
            Inscribirme al diplomado
          </a>
        </div>
      </div>
      <div className="mx-auto px-5 py-5 text-center sm:px-8 sm:text-left lg:px-16">
        <span className="text-xs text-white/45">
          © 2026 Capital Academy · Una empresa de Capital Inteligente
        </span>
      </div>
    </footer>
  );
}
