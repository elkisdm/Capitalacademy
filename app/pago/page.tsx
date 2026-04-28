import Image from "next/image";
import { CheckoutClient } from "./CheckoutClient";
import { DIPLOMADO_PRICE_CLP } from "@/lib/fintoc/checkout";

export const metadata = {
  title: "Ingreso al Diplomado · Capital Academy",
  description:
    "Inscripción al Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria. Pago seguro vía Fintoc.",
};

export default function PagoPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--color-ca-navy-deep)]">
      <div className="aurora-blob aurora-blob-lime" aria-hidden />
      <div className="aurora-blob aurora-blob-violet" aria-hidden />

      <section className="relative z-10 mx-auto flex min-h-dvh max-w-xl items-center px-4 py-16 sm:py-24">
        <div className="w-full">
          <header className="mb-10 text-center">
            <Image
              src="/brand/logo-light.png"
              alt="Capital Academy"
              width={96}
              height={95}
              priority
              className="mx-auto mb-5 h-20 w-auto sm:h-24"
            />
            <span className="mb-3 block text-[11px] font-bold uppercase tracking-[0.4em] text-[var(--color-ca-lime)]">
              Capital Academy
            </span>
            <h1 className="font-sans text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
              Ingreso al{" "}
              <span className="text-gradient-ca">Diplomado</span>
            </h1>
            <p className="mt-3 text-sm text-white/70 sm:text-base">
              Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria.
              Reserva tu cupo con un pago único.
            </p>
          </header>

          <CheckoutClient priceClp={DIPLOMADO_PRICE_CLP} />

          <p className="mt-8 text-center text-xs text-white/45">
            Pago procesado por Fintoc · Webpay, transferencia y tarjetas
            chilenas.
          </p>
        </div>
      </section>
    </main>
  );
}
