export const metadata = {
  title: "Pago recibido · Capital Academy",
};

export default function GraciasPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--color-surface)]">
      <div className="aurora-blob aurora-blob-teal" aria-hidden />
      <div className="aurora-blob aurora-blob-pink" aria-hidden />

      <section className="relative z-10 mx-auto flex min-h-dvh max-w-md items-center px-4 py-16 text-center">
        <div className="w-full rounded-2xl border border-[var(--border)] bg-[var(--color-surface-container)]/80 p-8 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-aqua)]/15 text-[var(--color-aqua)]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-7 w-7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="font-sans text-2xl font-black tracking-[-0.02em] text-white sm:text-3xl">
            Pago{" "}
            <span className="text-gradient-aqua-magenta">recibido</span>
          </h1>
          <p className="mt-3 text-sm text-white/70 sm:text-base">
            Estamos confirmando tu inscripción al Diplomado. Te enviaremos un
            correo con los siguientes pasos en los próximos minutos.
          </p>
          <p className="mt-6 text-[11px] text-white/45">
            Si no recibes nada en 30 minutos, escríbenos respondiendo al
            correo de bienvenida.
          </p>
        </div>
      </section>
    </main>
  );
}
