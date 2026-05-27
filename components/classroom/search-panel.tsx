"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type SearchPanelProps = {
  cohortId: string;
};

type SearchSnippet = {
  text: string;
  timestampSeconds: number;
};

type SearchResult = {
  lessonId: string;
  lessonSlug: string;
  lessonTitle: string;
  moduleSlug: string;
  moduleName: string;
  matches: SearchSnippet[];
};

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
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

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={i}
        className="rounded-sm px-0.5 text-ca-ink"
        style={{ background: "rgba(197,241,34,0.40)" }}
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function SearchPanel({ cohortId }: SearchPanelProps) {
  const router = useRouter();
  const [searchRaw, setSearchRaw] = useState("");
  const query = useDebounce(searchRaw, 500);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const fetchResults = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setSearched(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(
          `/api/classroom/search?q=${encodeURIComponent(q)}&cohortId=${encodeURIComponent(cohortId)}`,
        );
        if (!res.ok) {
          setResults([]);
          setSearched(true);
          return;
        }
        const json = await res.json();
        const data: SearchResult[] = json.results ?? json;
        setResults(data.slice(0, 20));
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    },
    [cohortId],
  );

  useEffect(() => {
    fetchResults(query);
  }, [query, fetchResults]);

  const handleSnippetClick = (
    moduleSlug: string,
    lessonSlug: string,
    seconds: number,
  ) => {
    router.push(
      `/classroom/${cohortId}/${moduleSlug}/${lessonSlug}?t=${Math.floor(seconds)}`,
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ca-ink-soft">
          <SearchIcon size={14} />
        </div>
        <input
          type="text"
          value={searchRaw}
          onChange={(e) => setSearchRaw(e.target.value)}
          placeholder="Buscar en transcripciones..."
          className="w-full rounded-full border border-ca-ink/[0.08] bg-ca-bg-soft px-4 py-2 pl-9 text-[13px] text-ca-ink outline-none transition-colors placeholder:text-ca-ink-soft/60 focus:border-ca-violet/30 focus:ring-1 focus:ring-ca-violet/20"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-ca-ink-soft">
            <Spinner />
          </div>
        )}
      </div>

      {/* Results area */}
      <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
        {/* Empty state — no search yet */}
        {!searched && !loading && (
          <div className="px-2 py-8 text-center">
            <p className="text-[12px] text-ca-ink-soft">
              Busca en todas las transcripciones de tus lecciones
            </p>
          </div>
        )}

        {/* No results */}
        {searched && !loading && results.length === 0 && query.trim() && (
          <div className="px-2 py-8 text-center">
            <p className="text-[12px] text-ca-ink-soft">
              No se encontraron resultados para &ldquo;{query}&rdquo;
            </p>
          </div>
        )}

        {/* Result cards */}
        {results.length > 0 && (
          <div className="flex flex-col gap-2">
            {results.map((result) => (
              <div
                key={result.lessonId}
                className="ca-card overflow-hidden p-0"
              >
                {/* Card header */}
                <div className="border-b border-ca-ink/[0.06] px-3 py-2">
                  <div className="text-[12px] font-bold text-ca-ink">
                    {result.lessonTitle}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ca-ink-soft">
                    {result.moduleName}
                  </div>
                </div>

                {/* Snippets */}
                <div className="flex flex-col">
                  {result.matches.map((snippet, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        handleSnippetClick(
                          result.moduleSlug,
                          result.lessonSlug,
                          snippet.timestampSeconds,
                        )
                      }
                      className="flex items-start gap-2 border-b border-ca-ink/[0.04] px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-ca-violet/[0.04]"
                    >
                      <span className="shrink-0 pt-px font-mono text-[11px] tabular-nums text-ca-ink-soft">
                        {fmtTime(snippet.timestampSeconds)}
                      </span>
                      <span className="flex-1 text-[12px] leading-relaxed text-ca-ink">
                        {highlightMatch(snippet.text, query)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
