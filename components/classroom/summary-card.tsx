"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────

type SummaryCardProps = {
  keyPoints: string[];
  summaryText: string;
  glossary: { term: string; definition: string }[];
  modelUsed?: string;
  generatedAt?: string;
};

// ── SVG icons — stroke 1.5, matching video-player style ─────

function SparkleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v1m0 16v1m-8-9H3m18 0h-1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707" />
      <path d="M12 8l1.5 3.5L17 13l-3.5 1.5L12 18l-1.5-3.5L7 13l3.5-1.5L12 8z" />
    </svg>
  );
}

function ChevronIcon({
  size = 16,
  direction = "down",
}: {
  size?: number;
  direction?: "down" | "up";
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: direction === "up" ? "rotate(180deg)" : undefined,
        transition: "transform 200ms ease",
      }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function EmptyIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M8 12h8M12 8v8" opacity={0.4} />
    </svg>
  );
}

// ── localStorage helper ──────────────────────────────────────

const STORAGE_KEY = "ca-summary-expanded";

function readExpanded(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

function writeExpanded(val: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, val ? "1" : "0");
  } catch {
    /* noop */
  }
}

// ── Section header ───────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ca-ink-soft">
      {children}
    </h4>
  );
}

// ── Main component ───────────────────────────────────────────

export function SummaryCard({
  keyPoints,
  summaryText,
  glossary,
  modelUsed,
  generatedAt,
}: SummaryCardProps) {
  const [expanded, setExpanded] = useState(true);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setExpanded(readExpanded());
  }, []);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      writeExpanded(next);
      return next;
    });
  }, []);

  const isEmpty = keyPoints.length === 0 && !summaryText.trim();

  // ── Empty state ─────────────────────────────────────────────

  if (isEmpty) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border border-ca-ink/[0.08] px-5 py-4"
        style={{ background: "rgba(94,23,235,0.03)" }}
      >
        <span className="text-ca-ink-soft">
          <EmptyIcon size={18} />
        </span>
        <span className="text-[13px] text-ca-ink-soft">
          Resumen no disponible para esta leccion
        </span>
      </div>
    );
  }

  // ── Paragraphs from summaryText ─────────────────────────────

  const paragraphs = summaryText
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div
      className="rounded-2xl border border-ca-ink/[0.08]"
      style={{ background: "rgba(94,23,235,0.03)" }}
    >
      {/* Header — always visible */}
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4"
        aria-expanded={expanded}
      >
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-ca-violet">
              <SparkleIcon size={16} />
            </span>
            <span className="text-[13px] font-bold text-ca-ink">
              Resumen generado con IA
            </span>
          </div>

        </div>

        <span className="shrink-0 text-ca-ink-soft">
          <ChevronIcon size={18} direction={expanded ? "up" : "down"} />
        </span>
      </button>

      {/* Collapsible body — CSS grid-rows trick for smooth animation */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="space-y-5 px-5 pb-5">
            {/* ── Key Points ─────────────────────────────── */}
            {keyPoints.length > 0 && (
              <div>
                <SectionLabel>Puntos clave</SectionLabel>
                <ol className="space-y-1.5">
                  {keyPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span
                        className="mt-[5px] h-2 w-2 shrink-0 rounded-full bg-ca-lime"
                        aria-hidden
                      />
                      <span className="text-[13px] leading-snug text-ca-ink">
                        {point}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* ── Summary ────────────────────────────────── */}
            {paragraphs.length > 0 && (
              <div>
                <SectionLabel>Resumen</SectionLabel>
                <div className="space-y-3">
                  {paragraphs.map((p, i) => (
                    <p
                      key={i}
                      className="text-[14px] leading-relaxed text-ca-ink"
                    >
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* ── Glossary ───────────────────────────────── */}
            {glossary.length > 0 && (
              <div>
                <SectionLabel>Glosario</SectionLabel>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {glossary.map((entry, i) => (
                    <div
                      key={i}
                      className="rounded-xl bg-ca-bg-soft p-3"
                    >
                      <div className="text-[13px] font-bold text-ca-ink">
                        {entry.term}
                      </div>
                      <div className="mt-0.5 text-[12px] leading-snug text-ca-ink-soft">
                        {entry.definition}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
