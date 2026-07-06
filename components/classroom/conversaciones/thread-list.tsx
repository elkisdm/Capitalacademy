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

// ── Time helper (copiado de comment-section.tsx) ───────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "hace un momento";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} ${days === 1 ? "día" : "días"}`;

  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? "mes" : "meses"}`;

  const years = Math.floor(months / 12);
  return `hace ${years} ${years === 1 ? "año" : "años"}`;
}

// ── Initials extractor (copiado de comment-section.tsx) ────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
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

  // Infinite scroll: `offset` = filas ya consumidas de la BD; `hasMore` se
  // apaga cuando una página vuelve con < PAGE_SIZE. El filtrado client-side
  // (categoría/búsqueda/orden/guardados) opera sobre la lista acumulada.
  const [offset, setOffset] = useState(initialThreads.length);
  const [hasMore, setHasMore] = useState(initialThreads.length >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/classroom/conversaciones?programId=${encodeURIComponent(programId)}&offset=${offset}`,
      );
      if (!res.ok) throw new Error("Error al cargar más conversaciones");
      const data = await res.json();
      const next = (data.threads ?? []) as ThreadListItem[];
      setThreads((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...next.filter((t) => !seen.has(t.id))];
      });
      setOffset((o) => o + next.length);
      if (next.length < PAGE_SIZE) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, offset, programId]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Estado (categoría/orden/búsqueda) reflejado en la URL para que sea
  // compartible y respete el botón "atrás". El filtrado sigue en cliente
  // sobre los hilos ya cargados (patrón de users-list-client.tsx).
  const catParam = searchParams.get("cat");
  const activeCategory: string = catParam && isValidCategory(catParam) ? catParam : "all";
  const sortParam = searchParams.get("sort");
  const sort: SortMode =
    sortParam === "top" || sortParam === "unanswered" ? sortParam : "recent";
  const search = searchParams.get("q") ?? "";
  const savedOnly = searchParams.get("saved") === "1";

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
      viewer_reacted: false,
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

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = threads.filter((t) => {
      if (savedOnly && !t.viewer_bookmarked) return false;
      if (activeCategory !== "all" && t.category !== activeCategory) return false;
      if (q) {
        const haystack = `${t.title} ${t.body}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (sort === "top") {
      list = [...list].sort((a, b) => b.reaction_count - a.reaction_count);
    } else if (sort === "unanswered") {
      list = list
        .filter((t) => t.comment_count === 0)
        .sort(
          (a, b) =>
            new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime(),
        );
    } else {
      list = [...list].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
      });
    }
    return list;
  }, [threads, activeCategory, search, sort, savedOnly]);

  const hasFilters =
    activeCategory !== "all" || search.trim() !== "" || sort !== "recent" || savedOnly;

  return (
    <div className="flex flex-col gap-5">
      <ThreadComposer programId={programId} onCreated={handleCreated} />

      {/* Chips de categoría */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por categoría">
        <button
          type="button"
          onClick={() => setCategory("all")}
          aria-pressed={activeCategory === "all"}
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            activeCategory === "all"
              ? "bg-ca-violet/[0.1] text-ca-violet"
              : "text-ca-ink-soft hover:bg-ca-bg-soft"
          }`}
        >
          Todas
        </button>
        {CONVERSATION_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            aria-pressed={activeCategory === c.key}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              activeCategory === c.key
                ? "bg-ca-violet/[0.1] text-ca-violet"
                : "text-ca-ink-soft hover:bg-ca-bg-soft"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Búsqueda + orden */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar…"
          aria-label="Buscar conversaciones"
          autoComplete="off"
          className="w-full rounded-lg border border-ca-ink/[0.12] bg-ca-surface px-3 py-2 text-[13px] text-ca-ink placeholder:text-ca-ink-soft/60 outline-none transition-colors focus:border-ca-violet sm:max-w-xs"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {SORT_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSort(tab.key)}
              aria-pressed={sort === tab.key}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                sort === tab.key
                  ? "bg-ca-violet/[0.1] text-ca-violet"
                  : "text-ca-ink-soft hover:bg-ca-bg-soft"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSavedOnly(!savedOnly)}
            aria-pressed={savedOnly}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              savedOnly
                ? "bg-ca-violet/[0.1] text-ca-violet"
                : "text-ca-ink-soft hover:bg-ca-bg-soft"
            }`}
          >
            <Bookmark
              size={13}
              fill={savedOnly ? "currentColor" : "none"}
              strokeWidth={savedOnly ? 0 : 1.75}
            />
            Guardados
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="ca-card flex flex-col items-center justify-center p-16 text-center">
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
          {visible.map((t) => (
            <Link
              key={t.id}
              href={`/classroom/${cohortSlug}/conversaciones/${t.id}`}
              className="ca-card ca-card-hoverable flex flex-col gap-3 p-5"
            >
              <div className="flex items-center gap-3">
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
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleBookmark(t.id);
                    }}
                    aria-pressed={t.viewer_bookmarked}
                    aria-label={
                      t.viewer_bookmarked ? "Quitar de guardados" : "Guardar conversación"
                    }
                    className={`rounded-full p-1.5 transition-colors ${
                      t.viewer_bookmarked
                        ? "text-ca-violet"
                        : "text-ca-ink-soft hover:bg-ca-bg-soft"
                    }`}
                  >
                    <Bookmark
                      size={15}
                      fill={t.viewer_bookmarked ? "currentColor" : "none"}
                      strokeWidth={t.viewer_bookmarked ? 0 : 1.75}
                    />
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-[16px] font-bold leading-snug text-ca-ink">{t.title}</h3>
                <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-ca-ink-soft">
                  {t.body}
                </p>
              </div>

              <div className="flex items-center gap-2 text-[12px] text-ca-ink-soft">
                <span>{timeAgo(t.last_activity_at)}</span>
                <span>·</span>
                <span>
                  {t.comment_count} {t.comment_count === 1 ? "comentario" : "comentarios"}
                </span>
                <span>·</span>
                <span>❤️ {t.reaction_count}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Sentinela de infinite scroll: al entrar en viewport carga la página
          siguiente desde la BD. El observer se re-arma vía `hasMore`. */}
      {hasMore && (
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
