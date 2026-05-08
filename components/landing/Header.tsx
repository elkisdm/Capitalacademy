import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "#que-es", label: "Qué es" },
  { href: "#programas", label: "Programas" },
  { href: "#por-que", label: "Por qué CA" },
  { href: "#contacto", label: "Contacto" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(20,22,58,0.08)] bg-[var(--color-ca-bg)]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/brand/logo-on-light.png"
            alt="Capital Academy"
            width={36}
            height={36}
            className="h-9 w-9"
            priority
          />
          <span className="hidden text-sm font-semibold tracking-wide text-[var(--color-ca-ink)] sm:inline">
            Capital Academy
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-[var(--color-ca-ink-soft)] transition-colors hover:text-[var(--color-ca-violet)]"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <a
          href="#contacto"
          className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-5 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_24px_rgba(94,23,235,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)]"
        >
          Solicitar info
        </a>
      </div>
    </header>
  );
}
