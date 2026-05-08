import Image from "next/image";
import { CheckoutClient } from "./CheckoutClient";
import { getActivePaymentProvider } from "@/lib/payments/provider";
import { daysUntilClose, formatCloseDate } from "@/lib/landing/constants";

export const metadata = {
  title: "Ingreso al Diplomado · Capital Academy",
  description:
    "Inscripción al Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria. Pago seguro online.",
};

export const dynamic = "force-dynamic";

export default function PagoPage() {
  const provider = getActivePaymentProvider();
  const providerLabel =
    provider === "flow"
      ? "Pago procesado por Flow · Webpay, transferencia, tarjetas y más."
      : "Pago procesado por Fintoc · Webpay, transferencia y tarjetas chilenas.";

  const days = daysUntilClose();
  const closeDateLabel = formatCloseDate();

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--color-ca-bg)]">
      {/* Brand decorations sutiles */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-32 h-72 w-72 brand-circle-lavender opacity-50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 bottom-32 h-64 w-64 brand-circle-lime opacity-30 blur-3xl"
      />

      <section className="relative z-10 mx-auto flex min-h-dvh max-w-xl items-center px-4 py-16 sm:py-24">
        <div className="w-full">
          <header className="mb-10 text-center">
            <Image
              src="/brand/logo-on-light.png"
              alt="Capital Academy"
              width={96}
              height={95}
              priority
              className="mx-auto mb-5 h-16 w-auto sm:h-20"
            />
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--color-ca-violet)]/25 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ca-violet)]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-ca-lime-deep)] opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-ca-lime-deep)]" />
              </span>
              Cohorte de lanzamiento · −50%
            </span>
            <h1 className="font-sans text-3xl font-black tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-4xl">
              Ingreso al{" "}
              <span className="text-[var(--color-ca-violet)]">Diplomado</span>
            </h1>
            <p className="mt-3 text-sm text-[var(--color-ca-ink-soft)] sm:text-base">
              Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria.
              Reserva tu cupo con un pago único.
            </p>
          </header>

          {/* Banner de urgencia con countdown — solo si quedan días */}
          {days > 0 && (
            <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[var(--color-ca-violet)]/25 bg-gradient-to-r from-[var(--color-ca-violet)]/[0.06] via-white to-[var(--color-ca-lime)]/[0.12] px-4 py-3 sm:px-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-ca-violet)] text-white shadow-[0_8px_20px_rgba(94,23,235,0.35)]">
                <span className="text-lg font-black leading-none tabular-nums">
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

          <CheckoutClient provider={provider} />

          <p className="mt-8 text-center text-xs text-[var(--color-ca-ink-soft)]/80">
            {providerLabel}
          </p>
        </div>
      </section>
    </main>
  );
}
