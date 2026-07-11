"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/utils/time-ago";
import { getInitials } from "@/lib/utils/initials";
import { linkify } from "@/lib/conversaciones/linkify";

// ── Types ────────────────────────────────────────────────────

type CommentSectionProps = {
  lessonId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserInitials: string;
  currentUserAvatarUrl?: string | null;
  /** Salta el video a un timestamp mm:ss detectado en el texto. Sin esto, los
   * timestamps se muestran como texto plano. */
  onSeek?: (seconds: number) => void;
  /** Docente/asistente/admin de la lección: habilita moderación (eliminar
   * comentarios ajenos). Default false para no romper `clase/[sessionId]`. */
  viewerIsStaff?: boolean;
};

type Profile = {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  is_staff?: boolean;
};

type SubmitResult = { ok: boolean; error?: string };

type Comment = {
  id: string;
  content: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at?: string | null;
  edited_at?: string | null;
  deleted?: boolean;
  profiles: Profile;
};

type SortOrder = "newest" | "oldest";

// ── SVG Icons ───────────────────────────────────────────────

function DotsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
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

function SortIcon({ size = 14 }: { size?: number }) {
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
      <path d="M3 6h18M3 12h12M3 18h6" />
    </svg>
  );
}

function MessageIcon({ size = 20 }: { size?: number }) {
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
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

// ── Avatar ──────────────────────────────────────────────────

function CommentAvatar({
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
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.36),
      }}
    >
      {avatarUrl ? (
        <Image src={avatarUrl} alt="" width={size} height={size} className="h-full w-full rounded-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
}

// ── Contenido: timestamps mm:ss clicables + linkify ──────────

const TIMESTAMP_REGEX = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g;

function parseTimestampToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

function renderCommentContent(content: string, onSeek?: (seconds: number) => void): ReactNode {
  const segments = content.split(TIMESTAMP_REGEX);
  return segments.map((segment, i) => {
    // Los índices impares son los timestamps capturados por el regex.
    if (i % 2 === 1) {
      if (onSeek) {
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSeek(parseTimestampToSeconds(segment))}
            className="font-bold text-ca-violet underline decoration-dotted underline-offset-2 hover:text-ca-violet-deep"
          >
            {segment}
          </button>
        );
      }
      return segment;
    }
    return <span key={i}>{linkify(segment)}</span>;
  });
}

// ── Skeleton (carga) ─────────────────────────────────────────
// Reserva la altura aproximada de comentarios reales para evitar el layout
// shift que empuja "Material de la clase" al terminar de cargar.

function CommentSkeletonRow() {
  return (
    <div className="flex gap-3">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

function CommentSectionSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <CommentSkeletonRow key={i} />
      ))}
    </div>
  );
}

// ── Comment Input ───────────────────────────────────────────

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
  onSubmit: (content: string) => Promise<SubmitResult>;
  onCancel?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(autoFocus);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await onSubmit(trimmed);
    setSubmitting(false);
    if (result.ok) {
      setValue("");
      setFocused(false);
    } else {
      setError(result.error ?? "Ocurrió un error. Intenta nuevamente.");
    }
  };

  const handleCancel = () => {
    setValue("");
    setError(null);
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
    <div className={`flex gap-3 ${compact ? "" : ""}`}>
      <CommentAvatar
        initials={initials}
        avatarUrl={avatarUrl}
        isCurrentUser
        size={compact ? 28 : 32}
      />
      <div className="flex-1">
        <Textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={focused ? 3 : 1}
          disabled={submitting}
          className={`resize-none rounded-lg px-3 py-2 text-[13px] transition-all ${
            focused ? "min-h-[72px]" : "min-h-[38px]"
          }`}
        />
        {error && (
          <p className="mt-1 text-[11px] text-red-600">{error}</p>
        )}
        {focused && (
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              disabled={submitting}
              className="h-auto min-h-0 rounded-lg px-3 py-1.5 text-[12px]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSubmit}
              disabled={!value.trim() || submitting}
              className="h-auto min-h-0 rounded-lg px-4 py-1.5 text-[12px]"
            >
              {submitting ? "Enviando…" : "Comentar"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Edición inline ───────────────────────────────────────────

function InlineEditForm({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string;
  onSave: (content: string) => Promise<SubmitResult>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await onSave(trimmed);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "No se pudo guardar el cambio");
    }
  };

  return (
    <div className="mt-1">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        disabled={submitting}
        autoFocus
        className="resize-none rounded-lg px-3 py-2 text-[13px]"
      />
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      <div className="mt-1.5 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
          className="h-auto min-h-0 rounded-lg px-3 py-1.5 text-[12px]"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          disabled={!value.trim() || submitting}
          className="h-auto min-h-0 rounded-lg px-4 py-1.5 text-[12px]"
        >
          {submitting ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}

function StaffBadge() {
  return (
    <span className="shrink-0 rounded-full bg-ca-violet/[0.12] px-1.5 py-0.5 text-[10px] font-bold text-ca-violet">
      Equipo
    </span>
  );
}

// ── Single Comment ──────────────────────────────────────────

function CommentItem({
  comment,
  currentUserId,
  currentUserInitials,
  currentUserAvatarUrl,
  replies,
  viewerIsStaff,
  onSeek,
  onReply,
  onDelete,
  onEdit,
}: {
  comment: Comment;
  currentUserId: string;
  currentUserInitials: string;
  currentUserAvatarUrl?: string | null;
  replies: Comment[];
  viewerIsStaff: boolean;
  onSeek?: (seconds: number) => void;
  onReply: (parentId: string, content: string) => Promise<SubmitResult>;
  onDelete: (id: string) => void;
  onEdit: (id: string, content: string) => Promise<SubmitResult>;
}) {
  const [showReplies, setShowReplies] = useState(replies.length <= 2);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwn = comment.profiles.id === currentUserId;
  const authorInitials = getInitials(comment.profiles.full_name);
  const canDelete = isOwn || viewerIsStaff;
  const canEdit = isOwn && !comment.deleted;

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [showMenu]);

  // Comentario borrado sin respuestas: no ocupa espacio.
  if (comment.deleted && replies.length === 0) return null;

  return (
    <div className="group">
      <div className="flex gap-3">
        <CommentAvatar
          initials={authorInitials}
          avatarUrl={comment.profiles.avatar_url}
          isCurrentUser={isOwn}
          size={32}
        />
        <div className="min-w-0 flex-1">
          {/* Author + time */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-ca-ink">
              {comment.profiles.full_name}
            </span>
            {comment.profiles.is_staff && <StaffBadge />}
            <span className="text-[11px] text-ca-ink-soft">
              {timeAgo(comment.created_at)}
              {comment.edited_at && " · (editado)"}
            </span>
          </div>

          {/* Content */}
          {comment.deleted ? (
            <p className="mt-0.5 text-[13px] italic leading-relaxed text-ca-ink-soft">
              Comentario eliminado
            </p>
          ) : isEditing ? (
            <InlineEditForm
              initialValue={comment.content ?? ""}
              onCancel={() => setIsEditing(false)}
              onSave={async (content) => {
                const result = await onEdit(comment.id, content);
                if (result.ok) setIsEditing(false);
                return result;
              }}
            />
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ca-ink">
              {renderCommentContent(comment.content ?? "", onSeek)}
            </p>
          )}

          {/* Actions row */}
          {!comment.deleted && !isEditing && (
            <div className="mt-1.5 flex items-center gap-3">
              {!comment.parent_id && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowReplyInput(!showReplyInput)}
                  className="h-auto min-h-0 rounded p-0 text-[12px] text-ca-ink-soft hover:bg-transparent hover:text-ca-violet"
                >
                  Responder
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Three-dot menu: propio y/o moderación de staff */}
        {(canDelete || canEdit) && !comment.deleted && (
          <div className="relative" ref={menuRef}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowMenu(!showMenu)}
              className="mt-1 h-auto min-h-0 rounded p-1 text-ca-ink-soft opacity-0 group-hover:opacity-100"
              aria-label="Opciones del comentario"
              aria-haspopup="menu"
              aria-expanded={showMenu}
            >
              <DotsIcon size={16} />
            </Button>
            {showMenu && (
              <div className="absolute right-0 top-8 z-10 min-w-[120px] rounded-lg border border-ca-ink/[0.08] bg-ca-surface py-1 shadow-lg">
                {canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setIsEditing(true);
                      setShowMenu(false);
                    }}
                    className="h-auto min-h-0 w-full justify-start rounded-none px-3 py-1.5 text-[12px] text-ca-ink hover:bg-ca-bg-soft"
                  >
                    Editar
                  </Button>
                )}
                {canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      onDelete(comment.id);
                      setShowMenu(false);
                    }}
                    className="h-auto min-h-0 w-full justify-start rounded-none px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
                  >
                    Eliminar
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Replies section */}
      {replies.length > 0 && (
        <div className="ml-[44px] mt-3 border-l-2 border-ca-violet/20 pl-4">
          {/* Toggle replies if more than 2 */}
          {replies.length > 2 && !showReplies && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowReplies(true)}
              className="mb-3 h-auto min-h-0 rounded p-0 text-[12px] text-ca-violet hover:bg-transparent hover:text-ca-violet-deep"
            >
              <ChevronDownIcon size={14} />
              {replies.length} respuestas
            </Button>
          )}

          {(showReplies ? replies : replies.slice(0, 2)).map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              currentUserId={currentUserId}
              viewerIsStaff={viewerIsStaff}
              onSeek={onSeek}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}

          {replies.length > 2 && showReplies && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowReplies(false)}
              className="mt-2 h-auto min-h-0 rounded p-0 text-[12px] text-ca-ink-soft hover:bg-transparent hover:text-ca-violet"
            >
              Ocultar respuestas
            </Button>
          )}
        </div>
      )}

      {/* Reply input */}
      {showReplyInput && (
        <div className="ml-[44px] mt-3">
          <CommentInput
            initials={currentUserInitials}
            avatarUrl={currentUserAvatarUrl}
            placeholder="Escribe una respuesta…"
            onSubmit={async (content) => {
              const result = await onReply(comment.id, content);
              if (result.ok) setShowReplyInput(false);
              return result;
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

// ── Reply Item (nested) ─────────────────────────────────────

function ReplyItem({
  reply,
  currentUserId,
  viewerIsStaff,
  onSeek,
  onDelete,
  onEdit,
}: {
  reply: Comment;
  currentUserId: string;
  viewerIsStaff: boolean;
  onSeek?: (seconds: number) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, content: string) => Promise<SubmitResult>;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOwn = reply.profiles.id === currentUserId;
  const initials = getInitials(reply.profiles.full_name);
  const canDelete = isOwn || viewerIsStaff;
  const canEdit = isOwn && !reply.deleted;

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [showMenu]);

  // Una respuesta borrada no tiene hijos (solo 1 nivel de anidación): se omite.
  if (reply.deleted) return null;

  return (
    <div className="group mb-3 flex gap-3">
      <CommentAvatar initials={initials} avatarUrl={reply.profiles.avatar_url} isCurrentUser={isOwn} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-ca-ink">
            {reply.profiles.full_name}
          </span>
          {reply.profiles.is_staff && <StaffBadge />}
          <span className="text-[10px] text-ca-ink-soft">
            {timeAgo(reply.created_at)}
            {reply.edited_at && " · (editado)"}
          </span>
        </div>
        {isEditing ? (
          <InlineEditForm
            initialValue={reply.content ?? ""}
            onCancel={() => setIsEditing(false)}
            onSave={async (content) => {
              const result = await onEdit(reply.id, content);
              if (result.ok) setIsEditing(false);
              return result;
            }}
          />
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ca-ink">
            {renderCommentContent(reply.content ?? "", onSeek)}
          </p>
        )}
      </div>

      {(canDelete || canEdit) && !isEditing && (
        <div className="relative" ref={menuRef}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowMenu(!showMenu)}
            className="mt-0.5 h-auto min-h-0 rounded p-1 text-ca-ink-soft opacity-0 group-hover:opacity-100"
            aria-label="Opciones del comentario"
            aria-haspopup="menu"
            aria-expanded={showMenu}
          >
            <DotsIcon size={14} />
          </Button>
          {showMenu && (
            <div className="absolute right-0 top-7 z-10 min-w-[120px] rounded-lg border border-ca-ink/[0.08] bg-ca-surface py-1 shadow-lg">
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsEditing(true);
                    setShowMenu(false);
                  }}
                  className="h-auto min-h-0 w-full justify-start rounded-none px-3 py-1.5 text-[12px] text-ca-ink hover:bg-ca-bg-soft"
                >
                  Editar
                </Button>
              )}
              {canDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onDelete(reply.id);
                    setShowMenu(false);
                  }}
                  className="h-auto min-h-0 w-full justify-start rounded-none px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
                >
                  Eliminar
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export function CommentSection({
  lessonId,
  currentUserId,
  currentUserName,
  currentUserInitials,
  currentUserAvatarUrl,
  onSeek,
  viewerIsStaff = false,
}: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // ── Fetch comments ─────────────────────────────────────────

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/classroom/comments?lessonId=${encodeURIComponent(lessonId)}`,
      );
      if (!res.ok) throw new Error("Error al cargar comentarios");
      const data = await res.json();
      setComments(data.comments ?? []);
      setHasMore(!!data.hasMore);
      setError(null);
    } catch (err) {
      console.error("fetchComments error", err);
      setError("No se pudieron cargar los comentarios");
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Close sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSortMenu(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [showSortMenu]);

  // ── Build thread tree ──────────────────────────────────────

  // Árbol root/replies + orden, memoizado: solo se recomputa si cambian los
  // comentarios o el orden (no en cada render ajeno, p.ej. abrir el dropdown).
  const { repliesMap, sortedRoots } = useMemo(() => {
    const rootComments = comments.filter((c) => !c.parent_id);
    const repliesMap = new Map<string, Comment[]>();
    for (const c of comments) {
      if (c.parent_id) {
        const existing = repliesMap.get(c.parent_id) ?? [];
        existing.push(c);
        repliesMap.set(c.parent_id, existing);
      }
    }
    const sortedRoots = [...rootComments].sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
    });
    return { repliesMap, sortedRoots };
  }, [comments, sortOrder]);

  const totalCount = comments.length;

  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  // ── Optimistic add ─────────────────────────────────────────

  const handleAddComment = useCallback(
    async (content: string): Promise<SubmitResult> => {
      const optimistic: Comment = {
        id: crypto.randomUUID(),
        content,
        parent_id: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted: false,
        profiles: {
          id: currentUserId,
          full_name: currentUserName,
          avatar_url: currentUserAvatarUrl,
        },
      };
      setComments((prev) => [...prev, optimistic]);

      try {
        const res = await fetch("/api/classroom/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId, content }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
          return { ok: false, error: data?.error ?? "Error al publicar el comentario" };
        }
        setComments((prev) =>
          prev.map((c) => (c.id === optimistic.id ? data.comment : c)),
        );
        return { ok: true };
      } catch {
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
        return { ok: false, error: "No se pudo conectar. Intenta nuevamente." };
      }
    },
    [lessonId, currentUserId, currentUserName, currentUserAvatarUrl],
  );

  const handleAddReply = useCallback(
    async (parentId: string, content: string): Promise<SubmitResult> => {
      const optimistic: Comment = {
        id: crypto.randomUUID(),
        content,
        parent_id: parentId,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted: false,
        profiles: {
          id: currentUserId,
          full_name: currentUserName,
          avatar_url: currentUserAvatarUrl,
        },
      };
      setComments((prev) => [...prev, optimistic]);

      try {
        const res = await fetch("/api/classroom/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId, content, parentId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
          return { ok: false, error: data?.error ?? "Error al publicar la respuesta" };
        }
        setComments((prev) =>
          prev.map((c) => (c.id === optimistic.id ? data.comment : c)),
        );
        return { ok: true };
      } catch {
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
        return { ok: false, error: "No se pudo conectar. Intenta nuevamente." };
      }
    },
    [lessonId, currentUserId, currentUserName, currentUserAvatarUrl],
  );

  // ── Delete (soft, revert selectivo) ─────────────────────────

  const handleDelete = useCallback(async (id: string) => {
    if (!window.confirm("¿Eliminar este comentario? Esta acción no se puede deshacer.")) return;
    const previous = commentsRef.current.find((c) => c.id === id);
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, deleted: true, content: null } : c)),
    );

    try {
      const res = await fetch(
        `/api/classroom/comments?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Error al eliminar");
    } catch {
      if (previous) {
        setComments((prev) => prev.map((c) => (c.id === id ? previous : c)));
      }
    }
  }, []);

  // ── Edit ─────────────────────────────────────────────────────

  const handleEdit = useCallback(
    async (id: string, content: string): Promise<SubmitResult> => {
      const previous = commentsRef.current.find((c) => c.id === id);
      setComments((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, content, edited_at: new Date().toISOString() } : c,
        ),
      );

      try {
        const res = await fetch("/api/classroom/comments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, content }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          if (previous) setComments((prev) => prev.map((c) => (c.id === id ? previous : c)));
          return { ok: false, error: data?.error ?? "Error al editar el comentario" };
        }
        setComments((prev) => prev.map((c) => (c.id === id ? data.comment : c)));
        return { ok: true };
      } catch {
        if (previous) setComments((prev) => prev.map((c) => (c.id === id ? previous : c)));
        return { ok: false, error: "No se pudo conectar. Intenta nuevamente." };
      }
    },
    [],
  );

  // ── Cargar más (comentarios anteriores) ─────────────────────

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const cursor = commentsRef.current.reduce<string | null>(
      (min, c) => (!min || c.created_at < min ? c.created_at : min),
      null,
    );
    if (!cursor) return;

    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/classroom/comments?lessonId=${encodeURIComponent(lessonId)}&before=${encodeURIComponent(cursor)}`,
      );
      if (!res.ok) throw new Error("Error al cargar más comentarios");
      const data = await res.json();
      setComments((prev) => [...(data.comments ?? []), ...prev]);
      setHasMore(!!data.hasMore);
    } catch {
      setError("No se pudieron cargar más comentarios");
    } finally {
      setLoadingMore(false);
    }
  }, [lessonId, hasMore, loadingMore]);

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[14px] font-bold text-ca-ink">
          <span className="text-ca-ink-soft">
            <MessageIcon size={18} />
          </span>
          {totalCount} {totalCount === 1 ? "comentario" : "comentarios"}
        </h3>

        {/* Sort dropdown */}
        <div className="relative" ref={sortRef}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="h-auto min-h-0 gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-ca-ink-soft"
            aria-haspopup="menu"
            aria-expanded={showSortMenu}
          >
            <SortIcon size={14} />
            {sortOrder === "newest" ? "Más recientes" : "Más antiguos"}
            <ChevronDownIcon size={12} />
          </Button>
          {showSortMenu && (
            <div className="absolute right-0 top-9 z-10 min-w-[150px] rounded-lg border border-ca-ink/[0.08] bg-ca-surface py-1 shadow-lg">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSortOrder("newest");
                  setShowSortMenu(false);
                }}
                className={`h-auto min-h-0 w-full justify-start rounded-none px-3 py-1.5 text-[12px] ${
                  sortOrder === "newest" ? "font-bold text-ca-violet" : "text-ca-ink"
                }`}
              >
                Más recientes
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSortOrder("oldest");
                  setShowSortMenu(false);
                }}
                className={`h-auto min-h-0 w-full justify-start rounded-none px-3 py-1.5 text-[12px] ${
                  sortOrder === "oldest" ? "font-bold text-ca-violet" : "text-ca-ink"
                }`}
              >
                Más antiguos
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main comment input */}
      <CommentInput
        initials={currentUserInitials}
        avatarUrl={currentUserAvatarUrl}
        placeholder="Escribe un comentario…"
        onSubmit={handleAddComment}
      />

      {/* Loading state */}
      {loading && <CommentSectionSkeleton />}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-600">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && totalCount === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="text-ca-ink-soft">
            <MessageIcon size={28} />
          </span>
          <p className="text-[13px] text-ca-ink-soft">
            Sé el primero en comentar esta lección
          </p>
        </div>
      )}

      {/* Comment list */}
      {!loading && !error && sortedRoots.length > 0 && (
        <div className="space-y-5">
          {sortedRoots.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              currentUserInitials={currentUserInitials}
              currentUserAvatarUrl={currentUserAvatarUrl}
              replies={repliesMap.get(comment.id) ?? []}
              viewerIsStaff={viewerIsStaff}
              onSeek={onSeek}
              onReply={handleAddReply}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      {/* Cargar más (comentarios anteriores) */}
      {!loading && !error && hasMore && (
        <div className="flex justify-center pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="h-auto min-h-0 rounded-lg px-3 py-1.5 text-[12px] text-ca-ink-soft hover:text-ca-violet"
          >
            {loadingMore ? "Cargando…" : "Cargar comentarios anteriores"}
          </Button>
        </div>
      )}
    </div>
  );
}
