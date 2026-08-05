"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight, Sparkles, Download, Compass } from "lucide-react";
import {
  articlesByAudience,
  CATEGORIES_BY_AUDIENCE,
  type Audience,
} from "@/lib/guide/content";

const TAB_LABEL: Record<Audience, string> = {
  student: "Para alumnos",
  team: "Para el equipo",
  teacher: "Para profesores",
};

export function GuideIndexClient({
  audiences,
  firstName,
  tourHref,
}: {
  audiences: Audience[];
  firstName: string | null;
  /**
   * Enlace para re-lanzar el tour guiado (ADR-0030), ya con `?tour=1`. Es null
   * cuando quien mira no tiene una cohorte a la que volver (staff sin
   * matrícula): no hay dashboard donde correrlo.
   */
  tourHref: string | null;
}) {
  const [tab, setTab] = useState<Audience>(audiences[0]);
  const [query, setQuery] = useState("");

  // Defensa: si un lote de contenido se despliega parcial y una audiencia
  // queda sin artículos, no se ofrece su pestaña.
  const visibleTabs = useMemo(
    () => audiences.filter((a) => articlesByAudience(a).length > 0),
    [audiences],
  );

  const categories = CATEGORIES_BY_AUDIENCE[tab];
  const all = useMemo(() => articlesByAudience(tab), [tab]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return all;
    return all.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.overview.toLowerCase().includes(q),
    );
  }, [all, query]);

  return (
    <div>
      {/* Header */}
      <div className="mb-7">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-ca-violet/[0.08] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-ca-violet">
          <Sparkles className="h-3.5 w-3.5" />
          Centro de ayuda
        </div>
        <h1 className="text-[30px] font-black leading-tight tracking-tight text-ca-ink md:text-[38px]">
          {firstName ? `Hola ${firstName}, ` : ""}¿en qué te ayudamos?
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ca-ink-soft md:text-[15px]">
          Guías paso a paso de todo lo que puedes hacer, con enlaces directos a cada pantalla.
          Elige un tema o busca lo que necesitas.
        </p>

        {tourHref && (
          <Link
            href={tourHref}
            prefetch={false}
            className="ca-btn-interactive mt-4 inline-flex items-center gap-2 rounded-xl border border-ca-violet/25 bg-ca-violet/[0.06] px-4 py-2.5 text-[13px] font-bold text-ca-violet transition-colors hover:bg-ca-violet/[0.12]"
          >
            <Compass className="h-4 w-4" />
            Ver el recorrido guiado de nuevo
          </Link>
        )}
      </div>

      {/* Controles: tabs + buscador */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {visibleTabs.length > 1 ? (
          <div className="inline-flex rounded-2xl border border-ca-ink/[0.08] bg-white p-1">
            {visibleTabs.map((a) => (
              <button
                key={a}
                onClick={() => setTab(a)}
                className="ca-btn-interactive rounded-xl px-5 py-2 text-[13px] font-bold transition-colors"
                style={{
                  background: tab === a ? "var(--color-ca-violet)" : "transparent",
                  color: tab === a ? "#fff" : "var(--color-ca-ink-soft)",
                }}
              >
                {TAB_LABEL[a]}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          {tab === "teacher" && (
            <a
              href="/api/guia/profesor/pdf"
              className="ca-btn-interactive inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-ca-ink/[0.14] bg-white px-3.5 py-2.5 text-[12.5px] font-bold text-ca-ink transition-colors hover:border-ca-violet hover:text-ca-violet"
            >
              <Download className="h-4 w-4" />
              Descargar en PDF
            </a>
          )}
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ca-ink-soft/60" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en la guía…"
              className="w-full rounded-xl border border-ca-ink/[0.14] bg-white py-2.5 pl-10 pr-4 text-[13px] font-medium text-ca-ink outline-none transition-colors focus:border-ca-violet"
            />
          </div>
        </div>
      </div>

      {/* Artículos por categoría */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-[14px] text-ca-ink-soft">
          No encontramos nada para “{query}”. Prueba con otras palabras.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {categories.map((cat) => {
            const items = filtered.filter((a) => a.category === cat);
            if (items.length === 0) return null;
            return (
              <section key={cat}>
                <h2 className="mb-3 font-sans text-[11px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                  {cat}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((a, i) => {
                    const Icon = a.icon;
                    return (
                      <Link
                        key={a.slug}
                        href={`/classroom/guia/${a.slug}`}
                        className="ca-fade-up ca-stagger ca-card group flex flex-col p-5 transition-[border-color,transform,box-shadow] duration-[200ms] hover:-translate-y-0.5 hover:border-ca-violet/30 hover:shadow-[0_8px_24px_rgba(20,22,58,0.07)] active:translate-y-0 active:shadow-none active:duration-[60ms]"
                        style={{ "--i": i } as React.CSSProperties}
                      >
                        <div className="mb-3 grid h-10 w-10 place-items-center rounded-2xl bg-ca-violet/[0.08] text-ca-violet">
                          <Icon className="h-5 w-5" />
                        </div>
                        <h3 className="text-[15px] font-black tracking-tight text-ca-ink">{a.title}</h3>
                        <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-ca-ink-soft">
                          {a.summary}
                        </p>
                        <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-ca-violet">
                          Ver guía
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
