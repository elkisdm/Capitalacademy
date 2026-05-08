import Image from "next/image";

export const metadata = {
  title: "Pago recibido · Capital Academy",
};

export default function GraciasPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--color-ca-bg)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-32 h-72 w-72 brand-circle-lavender opacity-50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 bottom-32 h-64 w-64 brand-circle-lime opacity-30 blur-3xl"
      />

      <section className="relative z-10 mx-auto flex min-h-dvh max-w-md items-center px-4 py-16 text-center">
        <div className="w-full rounded-3xl border border-[rgba(20,22,58,0.08)] bg-white p-8 shadow-[0_20px_60px_rgba(20,22,58,0.08)]">
          <Image
            src="/brand/logo-on-light.png"
            alt="Capital Academy"
            width={80}
            height={79}
            className="mx-auto mb-5 h-14 w-auto"
          />
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-ca-lime)] text-[var(--color-ca-ink)]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-7 w-7"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="font-sans text-2xl font-black tracking-[-0.02em] text-[var(--color-ca-ink)] sm:text-3xl">
            Pago{" "}
            <span className="text-[var(--color-ca-violet)]">recibido</span>
          </h1>
          <p className="mt-3 text-sm text-[var(--color-ca-ink-soft)] sm:text-base">
            Estamos confirmando tu inscripción al Diplomado. Te enviaremos un
            correo con los siguientes pasos en los próximos minutos.
          </p>
          <p className="mt-6 text-[11px] text-[var(--color-ca-ink-soft)]/80">
            Si no recibes nada en 30 minutos, escríbenos respondiendo al
            correo de bienvenida.
          </p>
        </div>
      </section>
    </main>
  );
}
