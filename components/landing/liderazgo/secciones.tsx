import Image from "next/image";
import Link from "next/link";
import { LIDERAZGO } from "@/lib/landing/liderazgo";
import { FormularioLiderazgo } from "./FormularioLiderazgo";

/* Landing del Programa de Liderazgo — registro sobrio tipo prospecto
   ejecutivo: tinta navy, hairlines, numeración de secciones y violeta
   solo como acento. Deliberadamente sin blobs ni lime del home. */

const ctaSolid =
  "inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--color-ca-ink)] px-8 text-sm font-bold tracking-[0.02em] text-white transition-colors hover:bg-[var(--color-ca-violet-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40 focus-visible:ring-offset-2 sm:w-auto";

const ctaOutline =
  "inline-flex h-12 w-full items-center justify-center rounded-full border border-[var(--color-ca-outline-strong)] bg-transparent px-8 text-sm font-bold tracking-[0.02em] text-[var(--color-ca-ink)] transition-colors hover:border-[var(--color-ca-violet)] hover:text-[var(--color-ca-violet)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40 focus-visible:ring-offset-2 sm:w-auto";

export function HeaderLiderazgo() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--color-ca-outline)] bg-[var(--color-ca-surface)]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-3 self-stretch rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40"
        >
          <Image
            src="/brand/logo-on-light.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8"
            priority
          />
          <span className="text-sm font-bold tracking-[0.02em] text-[var(--color-ca-ink)]">
            Capital Academy
            <span className="ml-3 hidden border-l border-[var(--color-ca-outline-strong)] pl-3 font-medium text-[var(--color-ca-ink-soft)] sm:inline">
              Programa de Liderazgo
            </span>
          </span>
        </Link>
        <a
          href="#inscripcion"
          className="inline-flex h-11 items-center rounded-full bg-[var(--color-ca-ink)] px-5 text-xs font-bold tracking-[0.04em] text-white transition-colors hover:bg-[var(--color-ca-violet-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40 md:h-10"
        >
          Inscribirme
        </a>
      </div>
    </header>
  );
}

export function HeroLiderazgo() {
  const h = LIDERAZGO.hero;
  const resumen = [
    { label: "Duración", valor: "16 horas cronológicas" },
    { label: "Formato", valor: "4 jornadas presenciales de 4 horas" },
    { label: "Horario sugerido", valor: "Viernes de 15:00 a 19:00" },
    { label: "Cierre", valor: "Proyecto aplicado a tu equipo real" },
  ];
  return (
    <section className="border-b border-[var(--color-ca-outline)] bg-[var(--color-ca-surface)] pb-20 pt-32 sm:pb-24 sm:pt-40">
      <div className="ca-fade-up mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-[1fr_360px] lg:gap-16">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ca-violet)] sm:tracking-[0.3em]">
            {h.kicker}
          </p>
          <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.025em] text-[var(--color-ca-navy-ink)] sm:text-5xl md:text-6xl">
            {h.titulo}
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-[var(--color-ca-ink-soft)]">
            {h.bajada}
          </p>

          <ul className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-[var(--color-ca-outline)] pt-6 lg:hidden">
            {h.meta.map((m) => (
              <li key={m} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-ca-violet)]"
                />
                <span className="text-sm font-semibold tracking-[0.02em] text-[var(--color-ca-ink)]">
                  {m}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap gap-4">
            <a href="#inscripcion" className={ctaSolid}>
              {h.cta}
            </a>
            <a href="#malla" className={ctaOutline}>
              Ver el programa
            </a>
          </div>
          <p className="mt-5 text-sm text-[var(--color-ca-ink-soft)]/80">
            Sin compromiso: te contactamos con la información completa del
            programa.
          </p>
        </div>

        <aside className="hidden rounded-2xl border border-[var(--color-ca-outline)] bg-[var(--color-ca-bg)] p-8 lg:block">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ca-ink-soft)]">
            El programa en una mirada
          </p>
          <dl className="mt-6 space-y-5">
            {resumen.map((r) => (
              <div key={r.label} className="border-t border-[var(--color-ca-outline)] pt-4">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ca-violet)]">
                  {r.label}
                </dt>
                <dd className="mt-1 text-sm font-medium leading-snug text-[var(--color-ca-ink)]">
                  {r.valor}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 border-t border-[var(--color-ca-outline)] pt-4 text-xs leading-relaxed text-[var(--color-ca-ink-soft)]">
            Próxima generación con fechas por confirmar — inscríbete y recibe
            la información primero.
          </p>
        </aside>
      </div>
    </section>
  );
}

/** Envoltorio editorial: número + título a la izquierda, contenido a la derecha. */
function Seccion({
  id,
  num,
  kicker,
  titulo,
  children,
  tone = "white",
}: {
  id?: string;
  num: string;
  kicker: string;
  titulo: string;
  children: React.ReactNode;
  tone?: "white" | "soft";
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 border-b border-[var(--color-ca-outline)] py-16 sm:py-20 ${
        tone === "soft"
          ? "bg-[var(--color-ca-bg)]"
          : "bg-[var(--color-ca-surface)]"
      }`}
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[260px_1fr] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--color-ca-violet)]">
            <span className="tabular-nums">{num}</span>
            <span aria-hidden className="mx-2 text-[var(--color-ca-outline-strong)]">
              —
            </span>
            {kicker}
          </p>
          <h2 className="mt-4 text-balance text-2xl font-semibold leading-snug tracking-[-0.02em] text-[var(--color-ca-navy-ink)] sm:text-3xl">
            {titulo}
          </h2>
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

export function QueEncontraras() {
  return (
    <Seccion num="01" kicker="El programa" titulo="¿Qué encontrarás?">
      <ul className="grid gap-px overflow-hidden rounded-2xl border border-[var(--color-ca-outline)] bg-[var(--color-ca-outline)] sm:grid-cols-2">
        {LIDERAZGO.queEncontraras.map((item, i) => (
          <li
            key={item}
            className="bg-[var(--color-ca-surface)] p-6 sm:p-7"
          >
            <span className="text-xs font-semibold tabular-nums text-[var(--color-ca-violet)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="mt-3 text-base font-medium leading-relaxed text-[var(--color-ca-ink)]">
              {item}
            </p>
          </li>
        ))}
      </ul>
    </Seccion>
  );
}

export function Resultados() {
  const r = LIDERAZGO.resultados;
  return (
    <Seccion num="02" kicker="Resultados" titulo={r.titulo} tone="soft">
      <ul className="space-y-4">
        {r.items.map((item) => (
          <li key={item} className="flex items-start gap-4">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mt-1 h-4 w-4 shrink-0 text-[var(--color-ca-violet)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-base leading-relaxed text-[var(--color-ca-ink)]">
              {item}
            </span>
          </li>
        ))}
      </ul>
      <a href="#inscripcion" className={`${ctaOutline} mt-10`}>
        {r.cta}
      </a>
    </Seccion>
  );
}

export function Malla() {
  return (
    <Seccion id="malla" num="03" kicker="Malla" titulo="Cuatro jornadas, un sistema">
      <ol className="space-y-0">
        {LIDERAZGO.jornadas.map((j) => (
          <li
            key={j.num}
            className="grid gap-4 border-t border-[var(--color-ca-outline)] py-7 last:border-b sm:grid-cols-[72px_1fr]"
          >
            <span
              aria-hidden
              className="text-3xl font-semibold tabular-nums leading-none text-[var(--color-ca-navy-ink)]/25 sm:text-4xl"
            >
              {String(j.num).padStart(2, "0")}
            </span>
            <div>
              <h3 className="text-lg font-semibold leading-snug text-[var(--color-ca-navy-ink)] sm:text-xl">
                Jornada {j.num} · {j.titulo}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--color-ca-ink-soft)]">
                {j.detalle}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-[var(--color-ca-ink)]">
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
                  Entregable
                </span>
                {j.entregable}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <a href="#inscripcion" className={`${ctaSolid} mt-10`}>
        Quiero inscribirme
      </a>
    </Seccion>
  );
}

export function PublicoObjetivo() {
  const p = LIDERAZGO.publico;
  return (
    <Seccion num="04" kicker="Público objetivo" titulo={p.titulo} tone="soft">
      <p className="max-w-2xl text-base leading-relaxed text-[var(--color-ca-ink-soft)]">
        {p.intro}
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {p.perfiles.map((perfil) => (
          <div
            key={perfil}
            className="rounded-2xl border border-[var(--color-ca-outline)] bg-[var(--color-ca-surface)] p-6"
          >
            <p className="text-[15px] font-medium leading-relaxed text-[var(--color-ca-ink)]">
              {perfil}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-8 border-l-2 border-[var(--color-ca-violet)] pl-5 text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">
        {p.recomendado}
      </p>
      <a href="#inscripcion" className={`${ctaSolid} mt-10`}>
        Sí, quiero inscribirme
      </a>
    </Seccion>
  );
}

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter((p) => p.length > 2 || p === p.toUpperCase())
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function EquipoAcademico() {
  return (
    <Seccion
      num="05"
      kicker="Equipo académico"
      titulo="Aprende con especialistas en liderazgo y gestión comercial inmobiliaria"
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LIDERAZGO.equipo.map((persona) => (
          <li
            key={persona.nombre}
            className="rounded-2xl border border-[var(--color-ca-outline)] bg-[var(--color-ca-surface)] p-6"
          >
            <span
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-ca-violet)]/25 text-sm font-bold tracking-wide text-[var(--color-ca-violet)]"
            >
              {iniciales(persona.nombre)}
            </span>
            <h3 className="mt-5 text-base font-semibold text-[var(--color-ca-navy-ink)]">
              {persona.nombre}
            </h3>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ca-ink-soft)]">
              {persona.rol}
            </p>
            {persona.bio && (
              <p className="mt-4 text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">
                {persona.bio}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Seccion>
  );
}

export function InfoPractica() {
  const f = LIDERAZGO.formato;
  return (
    <Seccion num="06" kicker="Formato" titulo={f.titulo} tone="soft">
      <dl className="overflow-hidden rounded-2xl border border-[var(--color-ca-outline)] bg-[var(--color-ca-surface)]">
        {f.datos.map((d) => (
          <div
            key={d.label}
            className="grid gap-1 border-b border-[var(--color-ca-outline)] px-6 py-4 last:border-b-0 sm:grid-cols-[200px_1fr] sm:items-baseline sm:gap-6"
          >
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ca-ink-soft)]">
              {d.label}
            </dt>
            <dd className="text-[15px] font-medium leading-relaxed text-[var(--color-ca-ink)]">
              {d.valor}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 border-l-2 border-[var(--color-ca-violet)] pl-5 text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">
        {f.pendiente}
      </p>
      <a href="#inscripcion" className={`${ctaOutline} mt-10`}>
        {f.cta}
      </a>
    </Seccion>
  );
}

export function Inscripcion() {
  const f = LIDERAZGO.formulario;
  return (
    <section
      id="inscripcion"
      className="scroll-mt-24 border-b border-[var(--color-ca-outline)] bg-[var(--color-ca-bg)] py-16 sm:py-20"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[260px_1fr] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--color-ca-violet)]">
            <span className="tabular-nums">11</span>
            <span aria-hidden className="mx-2 text-[var(--color-ca-outline-strong)]">
              —
            </span>
            Inscripción
          </p>
          <h2 className="mt-4 text-2xl font-semibold leading-snug tracking-[-0.02em] text-[var(--color-ca-navy-ink)] sm:text-3xl">
            {f.titulo}
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-[var(--color-ca-ink-soft)]">
            {f.intro}
          </p>
        </div>
        <FormularioLiderazgo cta={f.cta} />
      </div>
    </section>
  );
}

export function CierreLiderazgo() {
  const c = LIDERAZGO.cierre;
  return (
    <footer className="bg-[var(--color-ca-navy-ink)] py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="mx-auto max-w-3xl text-balance text-3xl font-semibold leading-[1.15] tracking-[-0.02em] text-white sm:text-4xl">
          {c.titulo}
        </h2>
        <a
          href="#inscripcion"
          className="mt-10 inline-flex h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-bold tracking-[0.02em] text-[var(--color-ca-navy-ink)] transition-colors hover:bg-[var(--color-ca-violet-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {c.cta}
        </a>
        <p className="mt-14 border-t border-white/10 pt-8 text-xs tracking-[0.04em] text-white/50">
          {c.bajada}{" "}
          <Link
            href="/"
            className="-m-3 inline-block p-3 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white"
          >
            capitalacademy.cl
          </Link>
        </p>
      </div>
    </footer>
  );
}
