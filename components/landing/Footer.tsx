import Image from "next/image";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[rgba(20,22,58,0.08)] bg-[var(--color-ca-bg)] pb-20 md:pb-0">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-12 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/logo-on-light.png"
            alt="Capital Academy"
            width={32}
            height={32}
            className="h-8 w-8"
          />
          <div>
            <p className="text-sm font-semibold text-[var(--color-ca-ink)]">
              Capital Academy
            </p>
            <p className="text-xs text-[var(--color-ca-ink-soft)]">
              La escuela de negocios de Capital Inteligente
            </p>
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-ca-ink-soft)]">
          © {year} Capital Academy · Todos los derechos reservados
        </p>
      </div>
    </footer>
  );
}
