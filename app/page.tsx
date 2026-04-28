import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Capital Academy · Work in Progress",
  description:
    "Estamos construyendo el sitio de Capital Academy. Mientras tanto, las inscripciones al Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria están abiertas.",
};

export default function Home() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--color-ca-navy-deep)]">
      <div className="aurora-blob aurora-blob-lime" aria-hidden />
      <div className="aurora-blob aurora-blob-violet" aria-hidden />

      <section className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <Image
          src="/brand/logo-light.png"
          alt="Capital Academy"
          width={120}
          height={119}
          priority
          className="mb-8 h-24 w-auto sm:h-28"
        />

        <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-ca-lime)]/40 bg-[var(--color-ca-lime)]/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ca-lime)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-ca-lime)]" />
          Sitio en construcción
        </span>

        <h1 className="font-sans text-4xl font-black leading-[1.05] tracking-[-0.04em] text-white sm:text-5xl md:text-6xl">
          Estamos construyendo
          <br />
          <span className="text-gradient-ca">algo grande.</span>
        </h1>

        <p className="mt-6 max-w-lg text-base leading-relaxed text-white/75 sm:text-lg">
          Mientras armamos el sitio completo de{" "}
          <strong className="text-white">Capital Academy</strong>, las
          inscripciones al{" "}
          <strong className="text-[var(--color-ca-lime)]">
            Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria
          </strong>{" "}
          ya están abiertas para un grupo reducido.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            href="/pago"
            className="inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-8 text-sm font-bold uppercase tracking-[0.15em] text-white shadow-[0_12px_32px_rgba(91,45,235,0.4)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)] hover:shadow-[0_16px_40px_rgba(91,45,235,0.5)] active:scale-[0.98]"
          >
            Inscribirme al Diplomado
          </Link>
          <span className="text-xs text-white/55">
            Cupos limitados · Pago seguro vía Fintoc
          </span>
        </div>

        <div className="mt-16 grid max-w-md grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl border border-[rgba(217,245,94,0.18)] bg-white/[0.03] p-4 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ca-violet-soft)]">
              Modalidad
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              Ejecutiva
            </p>
          </div>
          <div className="rounded-2xl border border-[rgba(217,245,94,0.18)] bg-white/[0.03] p-4 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ca-violet-soft)]">
              Cohorte
            </p>
            <p className="mt-1 text-sm font-semibold text-white">Reducida</p>
          </div>
          <div className="rounded-2xl border border-[rgba(217,245,94,0.18)] bg-white/[0.03] p-4 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ca-violet-soft)]">
              Inicio
            </p>
            <p className="mt-1 text-sm font-semibold text-white">Próximo</p>
          </div>
        </div>

        <footer className="mt-16 text-[11px] text-white/40">
          © {new Date().getFullYear()} Capital Academy · Todos los derechos
          reservados
        </footer>
      </section>
    </main>
  );
}
