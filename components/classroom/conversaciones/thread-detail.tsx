"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ThreadDetail, ConversationComment } from "@/lib/conversaciones/queries";
import { ReactionButton } from "./reaction-button";

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

// ── SVG Icons (copiados de comment-section.tsx) ────────────────

function DotsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

function ChevronDownIcon({ size = 14 }: { size?: number }) {
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
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// ── Avatar (patrón de comment-section.tsx) ──────────────────────

function Avatar({
  initials,
  avatarUrl,
  isCurrentUser,
  size = 32,
}: {
  initials: string;
  avatarUrl?: string | null;
  isCurrentUser: boolean;
  size?: number;
}) {
  return (
    <div
      className={`shape-circle inline-grid shrink-0 place-items-center font-bold text-white ${
        isCurrentUser ? "bg-ca-lime-deep" : "bg-ca-violet"
      }`}
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

// ── Comment Input ───────────────────────────────────────────────

function CommentInput({
  initials,
  avatarUrl,
  placeholder,
  onSubmit,
  onCancel,
  autoFocus = false,
  compact = false,
}: {
  initials: string;
  avatarUrl?: string | null;
  placeholder: string;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(autoFocus);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
    setFocused(false);
  };

  const handleCancel = () => {
    setValue("");
    setFocused(false);
    onCancel?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      handleCancel();
    }
  };

  return (
    <div className="flex gap-3">
      <Avatar initials={initials} avatarUrl={avatarUrl} isCurrentUser size={compact ? 28 : 32} />
      <div className="flex-1">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={focused ? 3 : 1}
          className={`w-full resize-none rounded-lg border border-ca-ink/[0.12] bg-ca-surface px-3 py-2 text-[13px] text-ca-ink placeholder:text-ca-ink-soft/60 transition-all focus:border-ca-violet focus:outline-none ${
            focused ? "min-h-[72px]" : "min-h-[38px]"
          }`}
        />
        {focused && (
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={handleCancel}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ca-ink-soft transition-colors hover:bg-ca-bg-soft"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!value.trim()}
              className="rounded-lg bg-ca-violet px-4 py-1.5 text-[12px] font-semibold text-white transition-all hover:bg-ca-violet-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              Comentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reply Item (nested) ─────────────────────────────────────────

function ReplyItem({
  reply,
  viewerId,
  onDelete,
}: {
  reply: ConversationComment;
  viewerId: string;
  onDelete: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOwn = reply.author.id === viewerId;
  const initials = getInitials(reply.author.full_name);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  return (
    <div className="group mb-3 flex gap-3">
      <Avatar initials={initials} avatarUrl={reply.author.avatar_url} isCurrentUser={isOwn} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-ca-ink">{reply.author.full_name}</span>
          <span className="text-[10px] text-ca-ink-soft">{timeAgo(reply.created_at)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ca-ink">{reply.body}</p>
        <div className="mt-1">
          <ReactionButton
            targetType="comment"
            targetId={reply.id}
            initialCount={reply.reaction_count}
            initialReacted={reply.viewer_reacted}
          />
        </div>
      </div>

      {isOwn && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="mt-0.5 rounded p-1 text-ca-ink-soft opacity-0 transition-all hover:bg-ca-bg-soft group-hover:opacity-100"
            aria-label="Opciones del comentario"
          >
            <DotsIcon size={14} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-7 z-10 min-w-[120px] rounded-lg border border-ca-ink/[0.08] bg-ca-surface py-1 shadow-lg">
              <button
                onClick={() => {
                  onDelete(reply.id);
                  setShowMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left text-[12px] text-red-600 transition-colors hover:bg-red-50"
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Root Comment ─────────────────────────────────────────────────

function CommentItem({
  comment,
  viewerId,
  viewerInitials,
  viewerAvatarUrl,
  locked,
  replies,
  onReply,
  onDelete,
}: {
  comment: ConversationComment;
  viewerId: string;
  viewerInitials: string;
  viewerAvatarUrl?: string | null;
  locked: boolean;
  replies: ConversationComment[];
  onReply: (parentId: string, body: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showReplies, setShowReplies] = useState(replies.length <= 2);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwn = comment.author.id === viewerId;
  const authorInitials = getInitials(comment.author.full_name);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  return (
    <div className="group">
      <div className="flex gap-3">
        <Avatar initials={authorInitials} avatarUrl={comment.author.avatar_url} isCurrentUser={isOwn} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-ca-ink">{comment.author.full_name}</span>
            <span className="text-[11px] text-ca-ink-soft">{timeAgo(comment.created_at)}</span>
          </div>

          <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ca-ink">{comment.body}</p>

          <div className="mt-1.5 flex items-center gap-3">
            <ReactionButton
              targetType="comment"
              targetId={comment.id}
              initialCount={comment.reaction_count}
              initialReacted={comment.viewer_reacted}
            />
            {!locked && (
              <button
                onClick={() => setShowReplyInput(!showReplyInput)}
                className="text-[12px] font-semibold text-ca-ink-soft transition-colors hover:text-ca-violet"
              >
                Responder
              </button>
            )}
          </div>
        </div>

        {isOwn && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="mt-1 rounded p-1 text-ca-ink-soft opacity-0 transition-all hover:bg-ca-bg-soft group-hover:opacity-100"
              aria-label="Opciones del comentario"
            >
              <DotsIcon size={16} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 z-10 min-w-[120px] rounded-lg border border-ca-ink/[0.08] bg-ca-surface py-1 shadow-lg">
                <button
                  onClick={() => {
                    onDelete(comment.id);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-[12px] text-red-600 transition-colors hover:bg-red-50"
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {replies.length > 0 && (
        <div className="ml-[44px] mt-3 border-l-2 border-ca-violet/20 pl-4">
          {replies.length > 2 && !showReplies && (
            <button
              onClick={() => setShowReplies(true)}
              className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-ca-violet transition-colors hover:text-ca-violet-deep"
            >
              <ChevronDownIcon size={14} />
              {replies.length} respuestas
            </button>
          )}

          {(showReplies ? replies : replies.slice(0, 2)).map((reply) => (
            <ReplyItem key={reply.id} reply={reply} viewerId={viewerId} onDelete={onDelete} />
          ))}

          {replies.length > 2 && showReplies && (
            <button
              onClick={() => setShowReplies(false)}
              className="mt-2 text-[12px] font-semibold text-ca-ink-soft transition-colors hover:text-ca-violet"
            >
              Ocultar respuestas
            </button>
          )}
        </div>
      )}

      {showReplyInput && !locked && (
        <div className="ml-[44px] mt-3">
          <CommentInput
            initials={viewerInitials}
            avatarUrl={viewerAvatarUrl}
            placeholder="Escribe una respuesta…"
            onSubmit={(body) => {
              onReply(comment.id, body);
              setShowReplyInput(false);
            }}
            onCancel={() => setShowReplyInput(false)}
            autoFocus
            compact
          />
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────

type ThreadDetailProps = {
  thread: ThreadDetail;
  /** Cuerpo del hilo ya renderizado en el server (Markdown) — evita mandar el
   *  parser de markdown al cliente en la ruta más pesada del classroom. */
  bodyRendered: ReactNode;
  initialComments: ConversationComment[];
  cohortSlug: string;
  viewerId: string;
  viewerName: string;
  viewerInitials: string;
  viewerAvatarUrl: string | null;
  isStaff: boolean;
};

export function ThreadDetail({
  thread,
  bodyRendered,
  initialComments,
  cohortSlug,
  viewerId,
  viewerName,
  viewerInitials,
  viewerAvatarUrl,
  isStaff,
}: ThreadDetailProps) {
  const router = useRouter();
  const [isPinned, setIsPinned] = useState(thread.is_pinned);
  const [isLocked, setIsLocked] = useState(thread.is_locked);
  const [comments, setComments] = useState<ConversationComment[]>(initialComments);
  const [showThreadMenu, setShowThreadMenu] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const threadMenuRef = useRef<HTMLDivElement>(null);

  const isAuthor = thread.author.id === viewerId;
  const canManageThread = isStaff || isAuthor;

  useEffect(() => {
    if (!showThreadMenu) return;
    const handler = (e: MouseEvent) => {
      if (threadMenuRef.current && !threadMenuRef.current.contains(e.target as Node)) {
        setShowThreadMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showThreadMenu]);

  const authorInitials = getInitials(thread.author.full_name);

  // ── Moderación del thread ───────────────────────────────────

  const handleTogglePinned = useCallback(async () => {
    if (moderating) return;
    setModerating(true);
    const next = !isPinned;
    try {
      const res = await fetch(`/api/classroom/conversaciones/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: next }),
      });
      if (!res.ok) throw new Error("Error al fijar la conversación");
      setIsPinned(next);
    } catch {
      // sin cambios si falla
    } finally {
      setModerating(false);
      setShowThreadMenu(false);
    }
  }, [moderating, isPinned, thread.id]);

  const handleToggleLocked = useCallback(async () => {
    if (moderating) return;
    setModerating(true);
    const next = !isLocked;
    try {
      const res = await fetch(`/api/classroom/conversaciones/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_locked: next }),
      });
      if (!res.ok) throw new Error("Error al cerrar la conversación");
      setIsLocked(next);
    } catch {
      // sin cambios si falla
    } finally {
      setModerating(false);
      setShowThreadMenu(false);
    }
  }, [moderating, isLocked, thread.id]);

  const handleDeleteThread = useCallback(async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/classroom/conversaciones/${thread.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar la conversación");
      router.push(`/classroom/${cohortSlug}/conversaciones`);
    } catch {
      setDeleting(false);
      setShowThreadMenu(false);
    }
  }, [deleting, thread.id, router, cohortSlug]);

  // ── Comentarios: árbol root/replies ─────────────────────────

  const { rootComments, repliesMap } = useMemo(() => {
    const rootComments = comments.filter((c) => !c.parent_id);
    const repliesMap = new Map<string, ConversationComment[]>();
    for (const c of comments) {
      if (c.parent_id) {
        const existing = repliesMap.get(c.parent_id) ?? [];
        existing.push(c);
        repliesMap.set(c.parent_id, existing);
      }
    }
    return { rootComments, repliesMap };
  }, [comments]);

  const commentsRef = useRef(comments);
  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  const handleAddComment = useCallback(
    async (body: string) => {
      const optimistic: ConversationComment = {
        id: `temp-${Date.now()}`,
        body,
        parent_id: null,
        created_at: new Date().toISOString(),
        author: { id: viewerId, full_name: viewerName, avatar_url: viewerAvatarUrl },
        reaction_count: 0,
        viewer_reacted: false,
      };
      setComments((prev) => [...prev, optimistic]);

      try {
        const res = await fetch("/api/classroom/conversaciones/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: thread.id, body }),
        });
        if (!res.ok) throw new Error("Error al crear comentario");
        const data = await res.json();
        setComments((prev) => prev.map((c) => (c.id === optimistic.id ? data.comment : c)));
      } catch {
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      }
    },
    [thread.id, viewerId, viewerName, viewerAvatarUrl],
  );

  const handleAddReply = useCallback(
    async (parentId: string, body: string) => {
      const optimistic: ConversationComment = {
        id: `temp-${Date.now()}`,
        body,
        parent_id: parentId,
        created_at: new Date().toISOString(),
        author: { id: viewerId, full_name: viewerName, avatar_url: viewerAvatarUrl },
        reaction_count: 0,
        viewer_reacted: false,
      };
      setComments((prev) => [...prev, optimistic]);

      try {
        const res = await fetch("/api/classroom/conversaciones/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: thread.id, body, parentId }),
        });
        if (!res.ok) throw new Error("Error al crear respuesta");
        const data = await res.json();
        setComments((prev) => prev.map((c) => (c.id === optimistic.id ? data.comment : c)));
      } catch {
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      }
    },
    [thread.id, viewerId, viewerName, viewerAvatarUrl],
  );

  const handleDeleteComment = useCallback(async (id: string) => {
    const backup = commentsRef.current;
    setComments((prev) => prev.filter((c) => c.id !== id && c.parent_id !== id));

    try {
      const res = await fetch(`/api/classroom/conversaciones/comments?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error al eliminar");
    } catch {
      setComments(backup);
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera del post */}
      <div className="ca-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar
              initials={authorInitials}
              avatarUrl={thread.author.avatar_url}
              isCurrentUser={isAuthor}
              size={40}
            />
            <div>
              <p className="text-[13.5px] font-bold text-ca-ink">{thread.author.full_name}</p>
              <p className="text-[11.5px] text-ca-ink-soft">{timeAgo(thread.created_at)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPinned && (
              <span className="rounded-full bg-ca-lime/[0.2] px-2 py-0.5 text-[11px] font-bold text-ca-ink">
                📌 Fijado
              </span>
            )}
            {isLocked && (
              <span className="rounded-full bg-ca-ink/[0.06] px-2 py-0.5 text-[11px] font-bold text-ca-ink-soft">
                🔒 Cerrado
              </span>
            )}

            {canManageThread && (
              <div className="relative" ref={threadMenuRef}>
                <button
                  onClick={() => setShowThreadMenu(!showThreadMenu)}
                  className="rounded p-1.5 text-ca-ink-soft transition-colors hover:bg-ca-bg-soft"
                  aria-label="Opciones de la conversación"
                >
                  <DotsIcon size={18} />
                </button>
                {showThreadMenu && (
                  <div className="absolute right-0 top-9 z-10 min-w-[170px] rounded-lg border border-ca-ink/[0.08] bg-ca-surface py-1 shadow-lg">
                    {isStaff && (
                      <>
                        <button
                          onClick={handleTogglePinned}
                          disabled={moderating}
                          className="w-full px-3 py-1.5 text-left text-[12px] text-ca-ink transition-colors hover:bg-ca-bg-soft disabled:opacity-50"
                        >
                          {isPinned ? "Quitar fijado" : "📌 Fijar"}
                        </button>
                        <button
                          onClick={handleToggleLocked}
                          disabled={moderating}
                          className="w-full px-3 py-1.5 text-left text-[12px] text-ca-ink transition-colors hover:bg-ca-bg-soft disabled:opacity-50"
                        >
                          {isLocked ? "🔓 Reabrir" : "🔒 Cerrar"}
                        </button>
                      </>
                    )}
                    <button
                      onClick={handleDeleteThread}
                      disabled={deleting}
                      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12px] text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleting && <Loader2 size={12} className="animate-spin" />}
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <h1 className="mt-4 text-[22px] font-black leading-tight tracking-tight text-ca-ink md:text-[26px]">
          {thread.title}
        </h1>
        <div className="mt-3">{bodyRendered}</div>

        <div className="mt-4">
          <ReactionButton
            targetType="thread"
            targetId={thread.id}
            initialCount={thread.reaction_count}
            initialReacted={thread.viewer_reacted}
          />
        </div>
      </div>

      {/* Comentarios */}
      <div className="space-y-5">
        <h2 className="text-[14px] font-bold text-ca-ink">
          {comments.length} {comments.length === 1 ? "comentario" : "comentarios"}
        </h2>

        {isLocked ? (
          <div className="rounded-lg border border-ca-ink/[0.08] bg-ca-bg-soft px-4 py-3 text-[13px] text-ca-ink-soft">
            Esta conversación está cerrada.
          </div>
        ) : (
          <CommentInput
            initials={viewerInitials}
            avatarUrl={viewerAvatarUrl}
            placeholder="Escribe un comentario…"
            onSubmit={handleAddComment}
          />
        )}

        {rootComments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-[13px] text-ca-ink-soft">Sé el primero en comentar esta conversación</p>
          </div>
        ) : (
          <div className="space-y-5">
            {rootComments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                viewerId={viewerId}
                viewerInitials={viewerInitials}
                viewerAvatarUrl={viewerAvatarUrl}
                locked={isLocked}
                replies={repliesMap.get(comment.id) ?? []}
                onReply={handleAddReply}
                onDelete={handleDeleteComment}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
