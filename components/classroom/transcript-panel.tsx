"use client";

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { parseVTT, type TranscriptSegment } from "@/lib/classroom/parse-vtt";
import { fmtTimestamp } from "@/lib/classroom/format";

type TranscriptPanelProps = {
  vttContent: string;
  correctedVtt?: string | null;
  currentTime: number;
  onSeek: (time: number) => void;
};

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function CopyIcon({ size = 14 }: { size?: number }) {
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
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function SearchIcon({ size = 14 }: { size?: number }) {
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
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={i}
        className="rounded-sm bg-ca-lime/40 px-0.5 text-ca-ink"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function TranscriptPanel({
  vttContent,
  correctedVtt,
  currentTime,
  onSeek,
}: TranscriptPanelProps) {
  const segments = useMemo(
    () => parseVTT(correctedVtt || vttContent),
    [correctedVtt, vttContent],
  );

  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, 300);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const userScrolledRef = useRef(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const activeIdx = useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].start && currentTime < segments[i].end) {
        return segments[i].index;
      }
    }
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].start) return segments[i].index;
    }
    return null;
  }, [segments, currentTime]);

  const filtered = useMemo(() => {
    if (!search) return segments;
    const lower = search.toLowerCase();
    return segments.filter((s) => s.text.toLowerCase().includes(lower));
  }, [segments, search]);

  const initialScrollDone = useRef(false);

  useEffect(() => {
    if (activeIdx == null || search) return;

    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      requestAnimationFrame(() => {
        const el = itemRefs.current.get(activeIdx);
        const container = scrollRef.current;
        if (!el || !container) return;
        const elTop = el.offsetTop;
        const elHeight = el.offsetHeight;
        const containerHeight = container.clientHeight;
        const targetScroll = elTop - containerHeight / 2 + elHeight / 2;
        container.scrollTo({ top: Math.max(0, targetScroll), behavior: "instant" });
      });
      return;
    }

    if (userScrolledRef.current) return;
    const el = itemRefs.current.get(activeIdx);
    const container = scrollRef.current;
    if (!el || !container) return;
    const elTop = el.offsetTop;
    const elHeight = el.offsetHeight;
    const containerHeight = container.clientHeight;
    const targetScroll = elTop - containerHeight / 2 + elHeight / 2;
    container.scrollTo({ top: Math.max(0, targetScroll), behavior: "smooth" });
  }, [activeIdx, search]);

  const handleUserScroll = useCallback(() => {
    userScrolledRef.current = true;
    clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      userScrolledRef.current = false;
    }, 5000);
  }, []);

  const handleCopy = useCallback(async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      /* clipboard not available */
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.target instanceof HTMLInputElement) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const currentFocus = focusedIdx ?? activeIdx;
        const currentListIdx = filtered.findIndex(
          (s) => s.index === currentFocus,
        );

        let nextListIdx: number;
        if (currentListIdx === -1) {
          nextListIdx = 0;
        } else if (e.key === "ArrowDown") {
          nextListIdx = Math.min(currentListIdx + 1, filtered.length - 1);
        } else {
          nextListIdx = Math.max(currentListIdx - 1, 0);
        }

        const next = filtered[nextListIdx];
        if (next) {
          setFocusedIdx(next.index);
          itemRefs.current.get(next.index)?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }
      }

      if (e.key === "Enter" && focusedIdx != null) {
        const seg = segments.find((s) => s.index === focusedIdx);
        if (seg) onSeek(seg.start);
      }
    },
    [focusedIdx, activeIdx, filtered, segments, onSeek],
  );

  const setItemRef = useCallback(
    (idx: number) => (el: HTMLDivElement | null) => {
      if (el) {
        itemRefs.current.set(idx, el);
      } else {
        itemRefs.current.delete(idx);
      }
    },
    [],
  );

  if (segments.length === 0) {
    return (
      <div className="ca-card flex items-center justify-center px-6 py-12">
        <p className="text-[13px] text-ca-ink-soft">
          La transcripción no está disponible para esta lección
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col overflow-hidden"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Search bar */}
      <div className="border-b border-ca-ink/[0.08] px-4 py-3">
        <div className="relative">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ca-ink-soft">
            <SearchIcon size={14} />
          </div>
          <input
            type="text"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Buscar en transcripción..."
            className="w-full rounded-xl border border-ca-ink/[0.08] bg-ca-bg-soft py-2 pl-9 pr-3 text-[13px] text-ca-ink outline-none transition-colors placeholder:text-ca-ink-soft/60 focus:border-ca-violet/30 focus:ring-1 focus:ring-ca-violet/20"
          />
        </div>
        {search && (
          <div className="mt-2 font-mono text-[11px] tabular-nums text-ca-ink-soft">
            {filtered.length} de {segments.length} segmentos
          </div>
        )}
      </div>

      {/* Segment list */}
      <div
        ref={scrollRef}
        onScroll={handleUserScroll}
        role="list"
        className="max-h-[500px] overflow-y-auto"
      >
        {filtered.map((seg) => {
          const isActive = seg.index === activeIdx;
          const isFocused = seg.index === focusedIdx;
          const isCopied = copiedIdx === seg.index;

          return (
            <div
              key={seg.index}
              ref={setItemRef(seg.index)}
              role="listitem"
              aria-current={isActive ? "true" : undefined}
              onClick={() => onSeek(seg.start)}
              className="group relative flex cursor-pointer gap-3 border-b border-ca-ink/[0.04] px-4 py-3 transition-colors hover:bg-ca-violet/[0.04]"
              style={{
                borderLeft: isActive ? "2px solid #c5f122" : "2px solid transparent",
                background: isActive
                  ? "rgba(94,23,235,0.04)"
                  : isFocused
                    ? "rgba(94,23,235,0.02)"
                    : undefined,
              }}
            >
              <span className="shrink-0 pt-px font-mono text-[11px] tabular-nums text-ca-ink-soft">
                {fmtTimestamp(seg.start)}
              </span>
              <span
                className={`flex-1 text-[13px] text-ca-ink ${isActive ? "font-bold" : ""}`}
              >
                {highlightMatch(seg.text, search)}
              </span>

              {/* Copy button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(seg.text, seg.index);
                }}
                className="absolute right-3 top-3 grid h-6 w-6 shrink-0 place-items-center rounded-md opacity-0 transition-opacity hover:bg-ca-ink/[0.06] group-hover:opacity-100"
                aria-label="Copiar segmento"
              >
                {isCopied ? (
                  <span className="text-ca-lime-deep">
                    <CheckIcon size={12} />
                  </span>
                ) : (
                  <span className="text-ca-ink-soft">
                    <CopyIcon size={12} />
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {filtered.length === 0 && search && (
          <div className="flex items-center justify-center px-6 py-12">
            <p className="text-[13px] text-ca-ink-soft">
              No se encontraron resultados para &ldquo;{search}&rdquo;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
