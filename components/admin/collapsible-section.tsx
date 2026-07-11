"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type CollapsibleSectionProps = {
  title: string;
  subtitle?: string;
  summary?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
};

export function CollapsibleSection({
  title,
  subtitle,
  summary,
  icon,
  defaultOpen = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={cn("ca-card group mb-6 overflow-hidden", className)}
    >
      <summary
        aria-controls={bodyId}
        className="flex cursor-pointer list-none items-center gap-3 px-6 py-4 hover:bg-ca-bg-soft [&::-webkit-details-marker]:hidden"
      >
        {icon && (
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ca-violet/10 text-ca-violet group-open:bg-ca-violet group-open:text-white"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-black text-ca-ink">{title}</p>
          {subtitle && (
            <p className="mt-0.5 truncate text-[12px] text-ca-ink-soft">{subtitle}</p>
          )}
        </div>
        {summary && (
          <span className="shrink-0 text-[11px] font-bold text-ca-ink-soft">{summary}</span>
        )}
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 shrink-0 text-ca-ink-soft transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div id={bodyId} className="border-t border-ca-ink/[0.06] px-6 py-5">
        {children}
      </div>
    </details>
  );
}
