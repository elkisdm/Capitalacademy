import Image from "next/image";
import Link from "next/link";
import { CheckoutClient } from "./CheckoutClient";
import { getActivePaymentProvider } from "@/lib/payments/provider";
import { daysUntilClose, formatCloseDate } from "@/lib/landing/constants";
import { PROGRAMS } from "@/lib/landing/programs";
import { Syllabus } from "@/components/landing/Syllabus";

export const metadata = {
  title: "Ingreso al Diplomado",
  description:
    "Inscripción al Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria. Pago seguro online.",
  openGraph: {
    title: "Ingreso al Diplomado",
    description:
      "Inscripción al Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria. Pago seguro online.",
    url: "/pago",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ingreso al Diplomado",
    description:
      "Inscripción al Diplomado Ejecutivo en Ventas y Asesoría de Inversión Inmobiliaria. Pago seguro online.",
  },
};

export const revalidate = 3600;

const FAQ = [
  {
    q: "¿Las clases quedan grabadas?",
    a: "Sí. Todas las sesiones en vivo se graban y quedan disponibles durante toda la cohorte para que puedas revisarlas a tu ritmo.",
  },
  {
    q: "¿Cuándo empiezan las clases?",
    a: "Cada cohorte tiene fecha confirmada que te enviamos por email apenas finalizas tu inscripción.",
  },
  {
    q: "¿Recibo un certificado?",
    a: "Sí. Al cumplir con los requisitos de aprobación (asistencia, entregables y proyecto integrador) recibes el diploma certificado de Capital Academy.",
  },
  {
    q: "¿Hay devolución si me arrepiento?",
    a: "Sí. Tienes 10 días para solicitar la devolución según política SERNAC, sin que hayas iniciado el contenido del programa.",
  },
];

export default function PagoPage() {
  const provider = getActivePaymentProvider();
  const providerLabel =
    provider === "flow"
      ? "Pago procesado por Flow · Webpay, transferencia, tarjetas y más."
      : "Pago procesado por Fintoc · Webpay, transferencia y tarjetas chilenas.";

  const days = daysUntilClose();
  const closeDateLabel = formatCloseDate();
  const d = PROGRAMS.diplomado;

  return (
    <main className="relative overflow-hidden bg-[var(--color-ca-bg)]">
      {/* Brand decorations sutiles */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-32 h-72 w-72 brand-circle-lavender opacity-50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-[60%] h-64 w-64 brand-circle-lime opacity-30 blur-3xl"
      />

      <div className="relative z-10 mx-auto max-w-3xl px-4 py-12 sm:py-16">
        {/* HEADER */}
        <header className="mb-8 text-center">
          <Link href="/" className="inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2 rounded-full">
            <Image
              src="/brand/logo-on-light.png"
              alt="Capital Academy"
              width={96}
              height={95}
              priority
              className="mx-auto mb-5 h-14 w-auto sm:h-16"
            />
          </Link>
          <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--color-ca-violet)]/25 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ca-violet)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-ca-lime-deep)] opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-ca-lime-deep)]" />
            </span>
            Cohorte de lanzamiento · −50%
          </span>
          <h1 className="font-sans text-3xl font-black tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-4xl md:text-5xl">
            Ingreso al{" "}
            <span className="text-[var(--color-ca-violet)]">Diplomado</span>
          </h1>
          <p className="mt-3 text-sm text-[var(--color-ca-ink-soft)] sm:text-base">
            {d.subtitle}
          </p>
        </header>

        {/* COUNTDOWN BANNER */}
        {days > 0 && (
          <div className="mb-8 flex items-center gap-3 rounded-2xl border border-[var(--color-ca-violet)]/25 bg-gradient-to-r from-[var(--color-ca-violet)]/[0.06] via-white to-[var(--color-ca-lime)]/[0.12] px-4 py-3 sm:px-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-ca-violet)] text-white shadow-[0_8px_20px_rgba(94,23,235,0.35)]">
              <span className="text-xl font-black leading-none tabular-nums">
                {days}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-ca-violet)]">
                Cierra el {closeDateLabel}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--color-ca-ink)]">
                {days === 1 ? "Queda 1 día" : `Quedan ${days} días`} para
                inscribirte con −50%
              </p>
            </div>
          </div>
        )}

        {/* QUICK FACTS — chips de duración / nivel / módulos / modalidad */}
        <ul className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <li className="rounded-2xl border border-[rgba(20,22,58,0.08)] bg-white px-4 py-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-ca-ink-soft)]">
              Nivel
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--color-ca-ink)]">
              {d.level}
            </p>
          </li>
          <li className="rounded-2xl border border-[rgba(20,22,58,0.08)] bg-white px-4 py-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-ca-ink-soft)]">
              Duración
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--color-ca-ink)]">
              {d.duration}
            </p>
          </li>
          <li className="rounded-2xl border border-[rgba(20,22,58,0.08)] bg-white px-4 py-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-ca-ink-soft)]">
              Módulos
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--color-ca-ink)]">
              {d.modules} módulos
            </p>
          </li>
          <li className="rounded-2xl border border-[rgba(20,22,58,0.08)] bg-white px-4 py-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--color-ca-ink-soft)]">
              Modalidad
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--color-ca-ink)]">
              {d.modality}
            </p>
          </li>
        </ul>

        {/* FORM (datos arriba, plan/pago abajo) */}
        <CheckoutClient provider={provider} />

        <p className="mt-6 text-center text-xs text-[var(--color-ca-ink-soft)]/80">
          {providerLabel}
        </p>

        {/* ===== MINI-LANDING DESDE ACÁ ===== */}

        {/* Lo que incluye + Áreas */}
        <section className="mt-16 rounded-3xl border border-[var(--color-ca-violet)]/15 bg-gradient-to-br from-[var(--color-ca-violet)]/[0.04] to-[var(--color-ca-lime)]/[0.06] p-6 sm:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
            Lo que incluye tu inscripción
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[var(--color-ca-ink)] sm:text-3xl">
            Todo lo que recibes con el Diplomado
          </h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {d.includes.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-sm text-[var(--color-ca-ink)]"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-ca-lime)] text-[var(--color-ca-ink)]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-7 border-t border-[rgba(20,22,58,0.08)] pt-5">
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ca-violet)]">
              Áreas que cubre
            </p>
            <div className="flex flex-wrap gap-2">
              {d.areas.map((area) => (
                <span
                  key={area}
                  className="inline-flex items-center rounded-lg border border-[var(--color-ca-violet)]/25 bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-ca-violet-deep)]"
                >
                  {area}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Para quiénes / Qué desarrolla */}
        <section className="mt-10 grid gap-5 sm:grid-cols-2">
          <div className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6 shadow-[0_18px_40px_rgba(20,22,58,0.06)]">
            <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
              Para quiénes
            </h3>
            <ul className="mt-4 space-y-2.5">
              {d.audience.map((a) => (
                <li
                  key={a}
                  className="flex gap-3 text-sm text-[var(--color-ca-ink)]"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ca-violet)]" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6 shadow-[0_18px_40px_rgba(20,22,58,0.06)]">
            <h3 className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
              Qué desarrolla
            </h3>
            <ul className="mt-4 space-y-2.5">
              {d.develops.map((m) => (
                <li
                  key={m}
                  className="flex gap-3 text-sm text-[var(--color-ca-ink)]"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ca-lime-deep)]" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Currículum colapsable */}
        <section className="mt-10">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
            Currículum
          </p>
          <h2 className="text-2xl font-black tracking-[-0.02em] text-[var(--color-ca-ink)] sm:text-3xl">
            Lo que vas a aprender semana a semana
          </h2>
          <Syllabus d={d} />
        </section>

        {/* Quote highlight */}
        <blockquote className="mt-10 rounded-3xl border-l-4 border-[var(--color-ca-violet)] bg-white px-6 py-6 shadow-[0_18px_40px_rgba(20,22,58,0.06)] sm:px-8 sm:py-7">
          <p className="text-base font-semibold leading-snug text-[var(--color-ca-ink)] sm:text-lg">
            “{d.highlight}”
          </p>
        </blockquote>

        {/* FAQ corta */}
        <section className="mt-10">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ca-violet)]">
            Preguntas frecuentes
          </p>
          <h2 className="text-2xl font-black tracking-[-0.02em] text-[var(--color-ca-ink)] sm:text-3xl">
            Lo que más nos preguntan al inscribirse
          </h2>
          <ul className="mt-5 space-y-3">
            {FAQ.map((item, idx) => (
              <li key={item.q}>
                <details className="group rounded-2xl border border-[rgba(20,22,58,0.08)] bg-white transition-colors open:border-[var(--color-ca-violet)]/30">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden sm:px-6">
                    <span className="text-xs font-black tabular-nums text-[var(--color-ca-violet)]">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-sm font-bold leading-snug text-[var(--color-ca-ink)] sm:text-base">
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
                  <p className="px-5 pb-5 text-sm leading-relaxed text-[var(--color-ca-ink-soft)] sm:px-6">
                    <span className="ml-9 block">{item.a}</span>
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </section>

        {/* Cierre con CTA secundario al programa */}
        <section className="mt-12 rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-6 text-center shadow-[0_18px_40px_rgba(20,22,58,0.06)] sm:p-8">
          <p className="text-sm text-[var(--color-ca-ink-soft)]">
            ¿Quieres ver el detalle completo del programa antes de inscribirte?
          </p>
          <Link
            href="/#detalle-diplomado"
            className="mt-3 inline-flex h-11 items-center justify-center rounded-full border border-[var(--color-ca-ink)]/15 bg-white px-6 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-ca-ink)] transition-colors hover:border-[var(--color-ca-violet)] hover:text-[var(--color-ca-violet)]"
          >
            Ver detalle del Diplomado
            <svg
              viewBox="0 0 24 24"
              className="ml-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Link>
        </section>
      </div>
    </main>
  );
}
