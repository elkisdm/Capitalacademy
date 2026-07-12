"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/classroom/primitives";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";

/**
 * Componentes presentacionales compartidos por las pantallas admin de
 * alumnos (`/admin/alumnos`, `/admin/progress`). Agnósticos de dominio:
 * reciben props planas, no tipos de `student-panel-queries` ni
 * `admin-queries`.
 */

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mql.matches);
    const handleChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isDesktop;
}

export function StatStrip({
  items,
}: {
  items: { label: string; value: string; sub?: string; tone?: string }[];
}) {
  return (
    <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-xl border border-ca-ink/[0.08] bg-white lg:flex">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex-1 border-t border-l border-ca-ink/[0.06] px-4 py-3 [&:nth-child(-n+2)]:border-t-0 [&:nth-child(odd)]:border-l-0 lg:border-t-0 lg:first:border-l-0 lg:[&:nth-child(odd):not(:first-child)]:border-l"
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ca-ink-soft">
            {item.label}
          </div>
          <div
            className="mt-1 font-mono text-[20px] font-black leading-none"
            style={{ color: item.tone }}
          >
            {item.value}
          </div>
          {item.sub && (
            <div className="mt-0.5 text-[10px] font-semibold text-ca-ink-soft">{item.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function StudentToolbar({
  chips,
  activeChip,
  onChip,
  search,
  onSearch,
  searchPlaceholder,
  rightSlot,
}: {
  chips: { id: string; label: string; count: number }[];
  activeChip: string;
  onChip: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((f) => (
        <button
          key={f.id}
          onClick={() => onChip(f.id)}
          className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40"
          style={{
            background: activeChip === f.id ? "var(--color-ca-ink)" : "transparent",
            color: activeChip === f.id ? "#fff" : "var(--color-ca-ink-soft)",
            border: activeChip === f.id ? "1px solid var(--color-ca-ink)" : "1px solid rgba(20,22,58,0.14)",
          }}
        >
          {f.label}
          <span
            className="rounded-full px-1.5 text-[10px]"
            style={{
              background: activeChip === f.id ? "var(--color-ca-lime)" : "var(--color-ca-bg-soft)",
              color: "var(--color-ca-ink)",
            }}
          >
            {f.count}
          </span>
        </button>
      ))}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {rightSlot}
        <div className="flex items-center gap-2 rounded-full bg-ca-bg-soft px-3 py-1.5">
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 opacity-50"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <Input
            aria-label="Buscar alumno"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="h-auto w-full min-w-0 flex-1 border-none bg-transparent p-0 text-[16px] font-medium focus:ring-0 sm:w-56 md:text-[12px]"
          />
        </div>
      </div>
    </div>
  );
}

export function StudentRow({
  initials,
  name,
  sub,
  selected,
  onSelect,
  badge,
  children,
}: {
  initials: string;
  name: string;
  sub: string;
  selected: boolean;
  onSelect: () => void;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(20,22,58,0.07)]",
        selected
          ? "border-ca-violet/30 bg-ca-violet/[0.04]"
          : "border-transparent hover:border-ca-ink/[0.08] hover:bg-ca-bg-soft/50",
      )}
    >
      <Avatar initials={initials} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold text-ca-ink">{name}</div>
        <div className="truncate font-mono text-[10px] text-ca-ink-soft">{sub}</div>
      </div>
      {children && <div className="flex shrink-0 items-center gap-3">{children}</div>}
      {badge}
    </button>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-ca-ink/[0.08] bg-white p-3">
      <div className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">{label}</div>
      <div className="mt-1 truncate font-mono text-[20px] font-black" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="truncate text-[11px] font-semibold text-ca-ink-soft">{sub}</div>}
    </div>
  );
}

export function DetailSectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
      {children}
    </div>
  );
}

function DetailPlaceholder() {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-ca-ink/[0.12] bg-white/50 py-20 text-center">
      <p className="text-[13px] font-semibold text-ca-ink-soft">Selecciona un alumno para ver su detalle</p>
    </div>
  );
}

export function TwoPane({
  list,
  detail,
  onClose,
}: {
  list: ReactNode;
  detail: ReactNode | null;
  onClose: () => void;
}) {
  const isDesktop = useIsDesktop();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start">
      <div>{list}</div>
      <div className="hidden lg:sticky lg:top-6 lg:block">
        {detail ? (
          <div className="overflow-hidden rounded-2xl border border-ca-ink/[0.08] bg-white">{detail}</div>
        ) : (
          <DetailPlaceholder />
        )}
      </div>
      <Dialog
        open={!!detail && !isDesktop}
        onClose={onClose}
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden p-0"
      >
        {detail}
      </Dialog>
    </div>
  );
}
