"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bookmark, Loader2 } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ThreadListItem } from "@/lib/conversaciones/queries";
import {
  CONVERSATION_CATEGORIES,
  categoryLabel,
  isValidCategory,
} from "@/lib/conversaciones/categories";
import { ThreadComposer, type ThreadListItemLike } from "./thread-composer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { timeAgo } from "@/lib/utils/time-ago";
import { getInitials } from "@/lib/utils/initials";

// ── Excerpt sin markdown crudo ───────────────────────────────────

/** Quita la sintaxis Markdown más común para mostrar un preview de texto
 *  plano (antes el excerpt mostraba `**negrita**`/`# título` crudos). */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

// ── Avatar (patrón de comment-section.tsx) ──────────────────────

function ThreadAvatar({
  initials,
  avatarUrl,
  size = 36,
}: {
  initials: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  return (
    <div
      className="shape-circle inline-grid shrink-0 place-items-center bg-ca-violet font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}

// ── Team badge ───────────────────────────────────────────────────

function TeamBadge() {
  return (
    <span className="shrink-0 rounded-full bg-ca-violet/[0.12] px-1.5 py-0.5 text-[10px] font-bold text-ca-violet">
      Equipo
    </span>
  );
}

// ── Main Component ───────────────────────────────────────────────

type SortMode = "recent" | "top" | "unanswered";

// Debe coincidir con DEFAULT_LIST_LIMIT del server (getProgramThreads).
const PAGE_SIZE = 50;

const SORT_TABS: Array<{ key: SortMode; label: string }> = [
  { key: "recent", label: "Recientes" },
  { key: "top", label: "Populares" },
  { key: "unanswered", label: "Sin responder" },
];

type RecentCursor = { isPinned: boolean; lastActivityAt: string; id: string };

function cursorFrom(t: ThreadListItem): RecentCursor {
  return { isPinned: t.is_pinned, lastActivityAt: t.last_activity_at, id: t.id };
}

function encodeCursor(c: RecentCursor): string {
  return `${c.isPinned}|${c.lastActivityAt}|${c.id}`;
}

type ThreadListProps = {
  programId: string;
  programName: string;
  cohortSlug: string;
  initialThreads: ThreadListItem[];
  viewerId: string;
  viewerName: string;
  viewerInitials: string;
  viewerAvatarUrl: string | null;
  isStaff: boolean;
};

export function ThreadList({
  programId,
  programName,
  cohortSlug,
  initialThreads,
  viewerId,
  viewerName,
  viewerAvatarUrl,
  isStaff,
}: ThreadListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [threads, setThreads] = useState<ThreadListItem[]>(initialThreads);

  // Estado (categoría/orden/búsqueda) reflejado en la URL para que sea
  // compartible y respete el botón "atrás".
  const catParam = searchParams.get("cat");
  const activeCategory: string = catParam && isValidCategory(catParam) ? catParam : "all";
  const sortParam = searchParams.get("sort");
  const sort: SortMode =
    sortParam === "top" || sortParam === "unanswered" ? sortParam : "recent";
  const search = searchParams.get("q") ?? "";
  const savedOnly = searchParams.get("saved") === "1";

  // Orden y búsqueda son server-side (T12/T18): al cambiar `sort`/`q` se
  // reemplaza la lista completa con un fetch al server (que busca/ordena
  // sobre TODOS los hilos del programa, no solo los ya cargados). El
  // infinite-scroll por keyset se mantiene SOLO para 'recent' sin búsqueda.
  const [cursor, setCursor] = useState<RecentCursor | null>(
    initialThreads.length > 0 ? cursorFrom(initialThreads[initialThreads.length - 1]) : null,
  );
  const [hasMore, setHasMore] = useState(initialThreads.length >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refetching, setRefetching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(
    async (opts: { sort: SortMode; q: string; cursor?: RecentCursor | null }) => {
      const params = new URLSearchParams({ programId });
      if (opts.sort !== "recent") params.set("sort", opts.sort);
      if (opts.q) params.set("q", opts.q);
      if (opts.sort === "recent" && opts.cursor) {
        params.set("cursor", encodeCursor(opts.cursor));
      }
      const res = await fetch(`/api/classroom/conversaciones?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar conversaciones");
      return (await res.json()) as { threads: ThreadListItem[] };
    },
    [programId],
  );

  const refetch = useCallback(async () => {
    setRefetching(true);
    setLoadError(null);
    try {
      const data = await fetchPage({ sort, q: search });
      setThreads(data.threads);
      const last = data.threads[data.threads.length - 1];
      setCursor(sort === "recent" && last ? cursorFrom(last) : null);
      setHasMore(sort === "recent" && data.threads.length >= PAGE_SIZE);
    } catch {
      setLoadError("No se pudieron cargar las conversaciones.");
    } finally {
      setRefetching(false);
    }
  }, [fetchPage, sort, search]);

  // Refetch server-side cuando cambia sort o búsqueda. Debounce solo mientras
  // se está tipeando un término (evita 1 request por tecla).
  useEffect(() => {
    const timeout = setTimeout(() => {
      void refetch();
    }, search ? 300 : 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, search]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || sort !== "recent") return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const data = await fetchPage({ sort: "recent", q: search, cursor });
      setThreads((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...data.threads.filter((t) => !seen.has(t.id))];
      });
      const last = data.threads[data.threads.length - 1];
      if (last) setCursor(cursorFrom(last));
      if (data.threads.length < PAGE_SIZE) setHasMore(false);
    } catch {
      setLoadError("No se pudieron cargar más conversaciones.");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, sort, search, cursor, fetchPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || sort !== "recent") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, sort, loadMore]);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  const setCategory = useCallback(
    (key: string) => updateParams({ cat: key === "all" ? null : key }),
    [updateParams],
  );
  const setSort = useCallback(
    (key: SortMode) => updateParams({ sort: key === "recent" ? null : key }),
    [updateParams],
  );
  const setSearch = useCallback(
    (value: string) => updateParams({ q: value || null }),
    [updateParams],
  );
  const setSavedOnly = useCallback(
    (value: boolean) => updateParams({ saved: value ? "1" : null }),
    [updateParams],
  );

  const handleCreated = (thread: ThreadListItemLike) => {
    const full: ThreadListItem = {
      ...thread,
      author: {
        id: viewerId,
        full_name: viewerName,
        avatar_url: viewerAvatarUrl,
        is_staff: isStaff,
      },
      reaction_count: 0,
      reactions: [],
      viewer_reaction: null,
      viewer_bookmarked: false,
    };
    setThreads((prev) => [full, ...prev]);
  };

  const toggleBookmark = useCallback(
    async (threadId: string) => {
      const current = threads.find((t) => t.id === threadId);
      const prev = current?.viewer_bookmarked ?? false;

      setThreads((list) =>
        list.map((t) => (t.id === threadId ? { ...t, viewer_bookmarked: !prev } : t)),
      );

      try {
        const res = await fetch("/api/classroom/conversaciones/bookmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId }),
        });
        if (!res.ok) throw new Error("Error al guardar");
        const data = await res.json();
        setThreads((list) =>
          list.map((t) =>
            t.id === threadId ? { ...t, viewer_bookmarked: data.bookmarked } : t,
          ),
        );
      } catch {
        setThreads((list) =>
          list.map((t) => (t.id === threadId ? { ...t, viewer_bookmarked: prev } : t)),
        );
      }
    },
    [threads],
  );

  // El server ya devuelve la lista ordenada/buscada (sort/q); acá solo se
  // aplican los filtros que siguen siendo client-side (categoría/guardados)
  // sobre el set ya cargado.
  const visible = useMemo(() => {
    return threads.filter((t) => {
      if (savedOnly && !t.viewer_bookmarked) return false;
      if (activeCategory !== "all" && t.category !== activeCategory) return false;
      return true;
    });
  }, [threads, activeCategory, savedOnly]);

  const hasFilters =
    activeCategory !== "all" || search.trim() !== "" || sort !== "recent" || savedOnly;

  return (
    <div className="flex flex-col gap-5">
      <ThreadComposer programId={programId} onCreated={handleCreated} />

      {/* Chips de categoría */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por categoría">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setCategory("all")}
          aria-pressed={activeCategory === "all"}
          className={`h-auto min-h-0 rounded-full px-3 py-1.5 text-[12px] ${
            activeCategory === "all"
              ? "bg-ca-violet/[0.1] text-ca-violet"
              : "text-ca-ink-soft"
          }`}
        >
          Todas
        </Button>
        {CONVERSATION_CATEGORIES.map((c) => (
          <Button
            key={c.key}
            type="button"
            variant="ghost"
            onClick={() => setCategory(c.key)}
            aria-pressed={activeCategory === c.key}
            className={`h-auto min-h-0 rounded-full px-3 py-1.5 text-[12px] ${
              activeCategory === c.key
                ? "bg-ca-violet/[0.1] text-ca-violet"
                : "text-ca-ink-soft"
            }`}
          >
            {c.label}
          </Button>
        ))}
      </div>

      {/* Búsqueda + orden */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar conversaciones"
          autoComplete="off"
          className="rounded-lg px-3 py-2 text-[13px] sm:max-w-xs"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {SORT_TABS.map((tab) => (
            <Button
              key={tab.key}
              type="button"
              variant="ghost"
              onClick={() => setSort(tab.key)}
              aria-pressed={sort === tab.key}
              className={`h-auto min-h-0 rounded-full px-3 py-1.5 text-[12px] ${
                sort === tab.key
                  ? "bg-ca-violet/[0.1] text-ca-violet"
                  : "text-ca-ink-soft"
              }`}
            >
              {tab.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSavedOnly(!savedOnly)}
            aria-pressed={savedOnly}
            className={`h-auto min-h-0 gap-1 rounded-full px-3 py-1.5 text-[12px] ${
              savedOnly
                ? "bg-ca-violet/[0.1] text-ca-violet"
                : "text-ca-ink-soft"
            }`}
          >
            <Bookmark
              size={13}
              fill={savedOnly ? "currentColor" : "none"}
              strokeWidth={savedOnly ? 0 : 1.75}
            />
            Guardados
          </Button>
        </div>
      </div>

      {loadError ? (
        <div className="ca-card flex flex-col items-center justify-center gap-2 p-10 text-center">
          <p className="text-[14px] font-bold text-red-600">{loadError}</p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void refetch()}
            className="h-auto min-h-0 rounded-lg px-3 py-1.5 text-[12px] text-ca-violet"
          >
            Reintentar
          </Button>
        </div>
      ) : refetching && visible.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={18} className="animate-spin text-ca-ink-soft" />
        </div>
      ) : visible.length === 0 ? (
        <div className="ca-card flex flex-col items-center justify-center p-8 text-center md:p-16">
          {savedOnly ? (
            <>
              <p className="text-[14px] font-bold text-ca-ink">Aún no has guardado conversaciones</p>
              <p className="mt-1 text-[13px] text-ca-ink-soft">
                Toca el ícono de guardar en una conversación para volver a ella más tarde.
              </p>
            </>
          ) : hasFilters ? (
            <>
              <p className="text-[14px] font-bold text-ca-ink">No hay conversaciones que coincidan</p>
              <p className="mt-1 text-[13px] text-ca-ink-soft">
                Prueba con otra categoría, orden o término de búsqueda.
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-bold text-ca-ink">Todavía no hay conversaciones</p>
              <p className="mt-1 text-[13px] text-ca-ink-soft">
                Sé el primero en compartir algo con la comunidad de {programName}.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((t, i) => (
            <div
              key={t.id}
              className="ca-card ca-card-hoverable ca-fade-up ca-stagger relative flex flex-col gap-3 p-5"
              style={{ "--i": i } as React.CSSProperties}
            >
              {/* Stretched-link: cubre toda la card para navegar, sin anidar
                  el botón de guardar (interactivo) dentro de un <a> (T18 —
                  antes el bookmark quedaba anidado en el <Link>, HTML inválido). */}
              <Link
                href={`/classroom/${cohortSlug}/conversaciones/${t.id}`}
                aria-label={t.title}
                className="absolute inset-0 z-0"
              />

              <div className="pointer-events-none relative z-10 flex items-center gap-3">
                <ThreadAvatar initials={getInitials(t.author.full_name)} avatarUrl={t.author.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[13px] font-bold text-ca-ink">{t.author.full_name}</p>
                    {t.author.is_staff && <TeamBadge />}
                  </div>
                  <p className="text-[11px] text-ca-ink-soft">{timeAgo(t.last_activity_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-full bg-ca-ink/[0.05] px-2 py-0.5 text-[11px] font-semibold text-ca-ink-soft">
                    {categoryLabel(t.category)}
                  </span>
                  {t.is_pinned && (
                    <span className="rounded-full bg-ca-lime/[0.2] px-2 py-0.5 text-[11px] font-bold text-ca-ink">
                      📌 Fijado
                    </span>
                  )}
                  {t.is_locked && (
                    <span className="rounded-full bg-ca-ink/[0.06] px-2 py-0.5 text-[11px] font-bold text-ca-ink-soft">
                      🔒 Cerrado
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleBookmark(t.id);
                    }}
                    aria-pressed={t.viewer_bookmarked}
                    aria-label={
                      t.viewer_bookmarked ? "Quitar de guardados" : "Guardar conversación"
                    }
                    className={`pointer-events-auto relative z-20 inline-grid h-11 w-11 place-items-center rounded-full md:h-9 md:w-9 ${
                      t.viewer_bookmarked ? "text-ca-violet" : "text-ca-ink-soft"
                    }`}
                  >
                    <Bookmark
                      size={15}
                      fill={t.viewer_bookmarked ? "currentColor" : "none"}
                      strokeWidth={t.viewer_bookmarked ? 0 : 1.75}
                    />
                  </Button>
                </div>
              </div>

              <div className="pointer-events-none relative z-10">
                <h3 className="text-[16px] font-bold leading-snug text-ca-ink">{t.title}</h3>
                <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-ca-ink-soft">
                  {stripMarkdown(t.body)}
                </p>
              </div>

              <div className="pointer-events-none relative z-10 flex flex-wrap items-center gap-2 text-[12px] text-ca-ink-soft">
                <span>{timeAgo(t.last_activity_at)}</span>
                <span>·</span>
                <span>
                  {t.comment_count} {t.comment_count === 1 ? "comentario" : "comentarios"}
                </span>
                <span>·</span>
                {t.reactions.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    {t.reactions.map((r) => (
                      <span key={r.emoji}>
                        {r.emoji} {r.count}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span>❤️ {t.reaction_count}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sentinela de infinite scroll (solo 'recent'): al entrar en viewport
          carga la página siguiente desde la BD vía keyset cursor. */}
      {hasMore && sort === "recent" && (
        <div ref={sentinelRef} className="flex items-center justify-center py-4">
          {loadingMore && (
            <span
              className="inline-flex items-center gap-2 text-[12px] font-semibold text-ca-ink-soft"
              role="status"
              aria-live="polite"
            >
              <Loader2 size={14} className="animate-spin" />
              Cargando más…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
