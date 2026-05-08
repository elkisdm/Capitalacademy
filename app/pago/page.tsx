import Image from "next/image";
import { CheckoutClient } from "./CheckoutClient";
import { getActivePaymentProvider } from "@/lib/payments/provider";

export const metadata = {
  title: "Ingreso al Diplomado · Capital Academy",
  description:
    "Inscripción al Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria. Pago seguro online.",
};

export default function PagoPage() {
  const provider = getActivePaymentProvider();
  const providerLabel =
    provider === "flow"
      ? "Pago procesado por Flow · Webpay, transferencia, tarjetas y más."
      : "Pago procesado por Fintoc · Webpay, transferencia y tarjetas chilenas.";

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
              Cohorte limitada · Cupos disponibles
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

          <CheckoutClient provider={provider} />

          <p className="mt-8 text-center text-xs text-[var(--color-ca-ink-soft)]/80">
            {providerLabel}
          </p>
        </div>
      </section>
    </main>
  );
}
