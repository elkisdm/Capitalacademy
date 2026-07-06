"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { ThreadListItem } from "@/lib/conversaciones/queries";
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

// ── Main Component ───────────────────────────────────────────────

type SortMode = "recent" | "top";

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
}: ThreadListProps) {
  const [threads, setThreads] = useState<ThreadListItem[]>(initialThreads);
  const [sort, setSort] = useState<SortMode>("recent");

  const handleCreated = (thread: ThreadListItemLike) => {
    const full: ThreadListItem = {
      ...thread,
      author: { id: viewerId, full_name: viewerName, avatar_url: viewerAvatarUrl },
      reaction_count: 0,
      viewer_reacted: false,
    };
    setThreads((prev) => [full, ...prev]);
  };

  const sorted = useMemo(() => {
    const list = [...threads];
    if (sort === "top") {
      list.sort((a, b) => b.reaction_count - a.reaction_count);
      return list;
    }
    list.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
    });
    return list;
  }, [threads, sort]);

  return (
    <div className="flex flex-col gap-5">
      <ThreadComposer programId={programId} onCreated={handleCreated} />

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSort("recent")}
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            sort === "recent"
              ? "bg-ca-violet/[0.1] text-ca-violet"
              : "text-ca-ink-soft hover:bg-ca-bg-soft"
          }`}
        >
          Recientes
        </button>
        <button
          type="button"
          onClick={() => setSort("top")}
          className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            sort === "top"
              ? "bg-ca-violet/[0.1] text-ca-violet"
              : "text-ca-ink-soft hover:bg-ca-bg-soft"
          }`}
        >
          Populares
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="ca-card flex flex-col items-center justify-center p-16 text-center">
          <p className="text-[14px] font-bold text-ca-ink">Todavía no hay conversaciones</p>
          <p className="mt-1 text-[13px] text-ca-ink-soft">
            Sé el primero en compartir algo con la comunidad de {programName}.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((t) => (
            <Link
              key={t.id}
              href={`/classroom/${cohortSlug}/conversaciones/${t.id}`}
              className="ca-card ca-card-hoverable flex flex-col gap-3 p-5"
            >
              <div className="flex items-center gap-3">
                <ThreadAvatar initials={getInitials(t.author.full_name)} avatarUrl={t.author.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-ca-ink">{t.author.full_name}</p>
                  <p className="text-[11px] text-ca-ink-soft">{timeAgo(t.last_activity_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
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
    </div>
  );
}
