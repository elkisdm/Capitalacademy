"use client";

import { useId, useState } from "react";

export function FaqLiderazgo({
  items,
}: {
  items: ReadonlyArray<{ q: string; a: string }>;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const uid = useId();

  return (
    <ul className="divide-y divide-[var(--color-ca-outline)] border-y border-[var(--color-ca-outline)]">
      {items.map((item, idx) => {
        const isOpen = openIndex === idx;
        return (
          <li key={item.q}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : idx)}
              aria-expanded={isOpen}
              aria-controls={`${uid}-faq-${idx}`}
              className="flex w-full cursor-pointer items-baseline gap-5 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ca-violet/40"
            >
              <span className="text-xs font-semibold tabular-nums text-[var(--color-ca-violet)]">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 text-base font-semibold leading-snug text-[var(--color-ca-ink)]">
                {item.q}
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className={`h-4 w-4 shrink-0 self-center text-[var(--color-ca-ink-soft)] transition-transform ${
                  isOpen ? "rotate-45" : ""
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            {isOpen && (
              <p
                id={`${uid}-faq-${idx}`}
                className="pb-6 pl-9 pr-8 text-sm leading-relaxed text-[var(--color-ca-ink-soft)] sm:text-base"
              >
                {item.a}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
