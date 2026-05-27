"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "#que-es", label: "Qué es" },
  { href: "#programas", label: "Programas" },
  { href: "#por-que", label: "Por qué CA" },
  { href: "#contacto", label: "Contacto" },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  const close = useCallback(() => setMenuOpen(false), []);

  /* Close on Escape */
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, close]);

  /* Lock body scroll when menu is open */
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(20,22,58,0.08)] bg-[var(--color-ca-bg)]/90 shadow-[0_4px_24px_rgba(20,22,58,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          aria-label="Capital Academy — Inicio"
          className="flex items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-ca-bg)]"
        >
          <Image
            src="/brand/logo-on-light.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9"
            priority
          />
          <span className="hidden text-sm font-semibold tracking-wide text-[var(--color-ca-ink)] sm:inline">
            Capital Academy
          </span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Principal" className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded text-sm font-medium text-[var(--color-ca-ink-soft)] transition-colors hover:text-[var(--color-ca-violet)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--color-ca-bg)]"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {/* CTA — hidden on very small screens when hamburger is present */}
          <a
            href="#contacto"
            className="hidden h-10 items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-5 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_24px_rgba(94,23,235,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-ca-violet-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ca-violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-ca-bg)] sm:inline-flex"
          >
            Solicitar info
          </a>

          {/* Hamburger button — visible below md */}
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="grid h-10 w-10 place-items-center rounded-lg text-[var(--color-ca-ink)] transition-colors hover:bg-[var(--color-ca-violet-soft)] md:hidden"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {menuOpen ? (
                <path d="M18 6 6 18M6 6l12 12" />
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer overlay */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={close}
            aria-hidden
          />

          {/* Drawer */}
          <nav
            aria-label="Menú móvil"
            className="fixed inset-x-0 top-[73px] z-50 border-b border-[rgba(20,22,58,0.08)] bg-[var(--color-ca-bg)] shadow-[0_12px_40px_rgba(20,22,58,0.12)] md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={close}
                  className="rounded-lg px-4 py-3 text-base font-medium text-[var(--color-ca-ink-soft)] transition-colors hover:bg-[var(--color-ca-violet-soft)] hover:text-[var(--color-ca-violet)]"
                >
                  {l.label}
                </a>
              ))}
              <a
                href="#contacto"
                onClick={close}
                className="mt-3 inline-flex h-12 items-center justify-center rounded-full bg-[var(--color-ca-violet)] px-6 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_24px_rgba(94,23,235,0.25)] transition-all hover:bg-[var(--color-ca-violet-deep)]"
              >
                Solicitar info
              </a>
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
