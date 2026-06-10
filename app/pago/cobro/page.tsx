import Image from "next/image";
import Link from "next/link";
import { CobroCheckoutClient } from "./CobroCheckoutClient";
import { getCobroSigningSecret, verifyCobroAmount } from "@/lib/cobro/sign";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pago · Capital Academy",
  description: "Pago seguro online.",
  robots: { index: false, follow: false },
};

const COBRO_CONCEPT = "Pago a Capital Academy";

export default async function CobroPage({
  searchParams,
}: {
  searchParams: Promise<{ monto?: string; sig?: string }>;
}) {
  const sp = await searchParams;
  const secret = getCobroSigningSecret();
  const monto = Number(sp.monto);
  const sig = sp.sig ?? "";

  const valid =
    secret !== null &&
    Number.isInteger(monto) &&
    verifyCobroAmount(monto, sig, secret);

  return (
    <main className="relative overflow-hidden bg-[var(--color-ca-bg)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-32 h-72 w-72 brand-circle-lavender opacity-50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-[60%] h-64 w-64 brand-circle-lime opacity-30 blur-3xl"
      />

      <div className="relative z-10 mx-auto max-w-xl px-4 py-12 sm:py-16">
        <header className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2"
          >
            <Image
              src="/brand/logo-on-light.png"
              alt="Capital Academy"
              width={96}
              height={95}
              priority
              className="mx-auto mb-5 h-14 w-auto sm:h-16"
            />
          </Link>
          <h1 className="font-sans text-3xl font-black tracking-[-0.03em] text-[var(--color-ca-ink)] sm:text-4xl">
            {COBRO_CONCEPT}
          </h1>
        </header>

        {valid ? (
          <CobroCheckoutClient
            amountClp={monto}
            sig={sig}
            concept={COBRO_CONCEPT}
          />
        ) : (
          <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-[0_20px_60px_rgba(20,22,58,0.08)]">
            <h2 className="text-lg font-bold text-[var(--color-ca-ink)]">
              Enlace de pago no válido
            </h2>
            <p className="mt-2 text-sm text-[var(--color-ca-ink-soft)]">
              Este enlace de cobro es inválido o expiró. Solicita un enlace nuevo
              a Capital Academy.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-[var(--color-ca-ink)]/15 bg-white px-6 text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-ca-ink)] transition-colors hover:border-[var(--color-ca-violet)] hover:text-[var(--color-ca-violet)]"
            >
              Volver al inicio
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
