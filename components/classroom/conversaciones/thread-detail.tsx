"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Bookmark, Loader2, RefreshCw } from "lucide-react";
import type { ThreadDetail, ConversationComment } from "@/lib/conversaciones/queries";
import { categoryLabel } from "@/lib/conversaciones/categories";
import { linkify } from "@/lib/conversaciones/linkify";
import { createClient } from "@/lib/supabase/client";
import { ReactionButton } from "./reaction-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

// ── Miembros (typeahead de menciones) ──────────────────────────

type Member = { id: string; full_name: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Renderiza el cuerpo de un comentario resaltando las menciones `@Nombre`
 * (violeta) de miembros conocidos, y aplica `linkify` al resto del texto para
 * no romper los enlaces. Si aún no hay miembros cargados, cae a `linkify`.
 */
function renderWithMentions(text: string, memberNames: string[]): ReactNode {
  if (memberNames.length === 0) return linkify(text);

  // Nombres más largos primero para preferir el match completo.
  const sorted = [...memberNames].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(@(?:${sorted.map(escapeRegExp).join("|")}))`, "g");
  const parts = text.split(pattern);

  return parts.map((part, i) => {
    // Índices impares = grupos capturados (menciones).
    if (i % 2 === 1) {
      return (
        <span key={i} className="rounded bg-ca-violet/[0.1] px-0.5 font-semibold text-ca-violet">
          {part}
        </span>
      );
    }
    return <span key={i}>{linkify(part)}</span>;
  });
}

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
  members,
  onSubmit,
  onCancel,
  autoFocus = false,
  compact = false,
}: {
  initials: string;
  avatarUrl?: string | null;
  placeholder: string;
  members: Member[];
  onSubmit: (body: string, mentions: string[]) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(autoFocus);
  // Ids de miembros mencionados (se agregan al elegir del typeahead).
  const [mentions, setMentions] = useState<string[]>([]);
  // Estado del typeahead: query tras la "@" y posición de esa "@" en el texto.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [atIndex, setAtIndex] = useState<number>(-1);
  const [activeOption, setActiveOption] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Detecta el token "@…" inmediatamente antes del cursor para el typeahead.
  const detectMention = (text: string, caret: number) => {
    const upToCaret = text.slice(0, caret);
    const match = upToCaret.match(/@([^@\n]*)$/);
    if (match) {
      setAtIndex(caret - match[0].length);
      setMentionQuery(match[1]);
      setActiveOption(0);
    } else {
      setMentionQuery(null);
      setAtIndex(-1);
    }
  };

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase().trim();
    return members
      .filter((m) => (q ? m.full_name.toLowerCase().includes(q) : true))
      .slice(0, 6);
  }, [members, mentionQuery]);

  const showTypeahead = mentionQuery !== null && suggestions.length > 0;

  const selectMention = (member: Member) => {
    if (atIndex < 0) return;
    const caret = inputRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, atIndex);
    const after = value.slice(caret);
    const inserted = `@${member.full_name} `;
    const next = `${before}${inserted}${after}`;
    setValue(next);
    setMentions((prev) => (prev.includes(member.id) ? prev : [...prev, member.id]));
    setMentionQuery(null);
    setAtIndex(-1);
    // Reposiciona el cursor tras la mención insertada.
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setValue(text);
    detectMention(text, e.target.selectionStart ?? text.length);
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    // Solo las menciones cuyo "@Nombre" sigue presente en el texto final.
    const kept = mentions.filter((id) => {
      const name = members.find((m) => m.id === id)?.full_name;
      return name ? trimmed.includes(`@${name}`) : false;
    });
    onSubmit(trimmed, kept);
    setValue("");
    setMentions([]);
    setMentionQuery(null);
    setFocused(false);
  };

  const handleCancel = () => {
    setValue("");
    setMentions([]);
    setMentionQuery(null);
    setFocused(false);
    onCancel?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showTypeahead) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveOption((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveOption((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMention(suggestions[activeOption]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        setAtIndex(-1);
        return;
      }
    }
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
      <div className="relative flex-1">
        <Textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          onClick={(e) => detectMention(value, e.currentTarget.selectionStart ?? value.length)}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={focused ? 3 : 1}
          className={`resize-none rounded-lg px-3 py-2 text-[13px] transition-all ${
            focused ? "min-h-[72px]" : "min-h-[38px]"
          }`}
        />

        {showTypeahead && (
          <ul
            role="listbox"
            aria-label="Sugerencias de mención"
            className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full max-w-[280px] overflow-auto rounded-lg border border-ca-ink/[0.08] bg-ca-surface py-1 shadow-lg"
          >
            {suggestions.map((m, i) => (
              <li key={m.id} role="option" aria-selected={i === activeOption}>
                <button
                  type="button"
                  // onMouseDown para no perder el foco del textarea antes del click.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMention(m);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors ${
                    i === activeOption ? "bg-ca-violet/[0.08] text-ca-violet" : "text-ca-ink hover:bg-ca-bg-soft"
                  }`}
                >
                  <span className="shape-circle inline-grid h-6 w-6 shrink-0 place-items-center bg-ca-violet text-[10px] font-bold text-white">
                    {getInitials(m.full_name)}
                  </span>
                  <span className="truncate font-semibold">{m.full_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {focused && (
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              className="h-auto min-h-0 rounded-lg px-3 py-1.5 text-[12px]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSubmit}
              disabled={!value.trim()}
              className="h-auto min-h-0 rounded-lg px-4 py-1.5 text-[12px]"
            >
              Comentar
            </Button>
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
  memberNames,
  onDelete,
}: {
  reply: ConversationComment;
  viewerId: string;
  memberNames: string[];
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

  return (
    <div className="group mb-3 flex gap-3">
      <Avatar initials={initials} avatarUrl={reply.author.avatar_url} isCurrentUser={isOwn} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-ca-ink">{reply.author.full_name}</span>
          <span className="text-[10px] text-ca-ink-soft">{timeAgo(reply.created_at)}</span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ca-ink">
          {renderWithMentions(reply.body, memberNames)}
        </p>
        <div className="mt-1">
          <ReactionButton
            targetType="comment"
            targetId={reply.id}
            reactions={reply.reactions}
            viewerReaction={reply.viewer_reaction}
          />
        </div>
      </div>

      {isOwn && (
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
  members,
  memberNames,
  onReply,
  onDelete,
}: {
  comment: ConversationComment;
  viewerId: string;
  viewerInitials: string;
  viewerAvatarUrl?: string | null;
  locked: boolean;
  replies: ConversationComment[];
  members: Member[];
  memberNames: string[];
  onReply: (parentId: string, body: string, mentions: string[]) => void;
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

  return (
    <div className="group">
      <div className="flex gap-3">
        <Avatar initials={authorInitials} avatarUrl={comment.author.avatar_url} isCurrentUser={isOwn} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-ca-ink">{comment.author.full_name}</span>
            <span className="text-[11px] text-ca-ink-soft">{timeAgo(comment.created_at)}</span>
          </div>

          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ca-ink">
            {renderWithMentions(comment.body, memberNames)}
          </p>

          <div className="mt-1.5 flex items-center gap-3">
            <ReactionButton
              targetType="comment"
              targetId={comment.id}
              reactions={comment.reactions}
              viewerReaction={comment.viewer_reaction}
            />
            {!locked && (
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
        </div>

        {isOwn && (
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
              </div>
            )}
          </div>
        )}
      </div>

      {replies.length > 0 && (
        <div className="ml-[44px] mt-3 border-l-2 border-ca-violet/20 pl-4">
          {replies.length > 2 && !showReplies && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowReplies(true)}
              className="mb-3 h-auto min-h-0 gap-1.5 rounded p-0 text-[12px] text-ca-violet hover:bg-transparent hover:text-ca-violet-deep"
            >
              <ChevronDownIcon size={14} />
              {replies.length} respuestas
            </Button>
          )}

          {(showReplies ? replies : replies.slice(0, 2)).map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              viewerId={viewerId}
              memberNames={memberNames}
              onDelete={onDelete}
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

      {showReplyInput && !locked && (
        <div className="ml-[44px] mt-3">
          <CommentInput
            initials={viewerInitials}
            avatarUrl={viewerAvatarUrl}
            placeholder="Escribe una respuesta…"
            members={members}
            onSubmit={(body, mentions) => {
              onReply(comment.id, body, mentions);
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
  const [bookmarked, setBookmarked] = useState(thread.viewer_bookmarked);
  const [bookmarking, setBookmarking] = useState(false);
  const [comments, setComments] = useState<ConversationComment[]>(initialComments);
  const [showThreadMenu, setShowThreadMenu] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [hasNewComments, setHasNewComments] = useState(false);
  const threadMenuRef = useRef<HTMLDivElement>(null);

  const isAuthor = thread.author.id === viewerId;
  const canManageThread = isStaff || isAuthor;

  const memberNames = useMemo(() => members.map((m) => m.full_name), [members]);

  // Carga única de miembros del programa para el typeahead de menciones.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/classroom/conversaciones/members?programId=${encodeURIComponent(thread.program_id)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMembers((data.members ?? []) as Member[]);
      } catch {
        // typeahead opcional: si falla, el comentario sigue funcionando
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thread.program_id]);

  // Realtime: avisa (sin renderizar el comentario crudo) cuando entra un
  // comentario de OTRA persona en este hilo. El RLS del cliente browser filtra
  // a los hilos que el viewer puede leer.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`thread-${thread.id}-comments`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_comments",
          filter: `thread_id=eq.${thread.id}`,
        },
        (payload) => {
          const row = payload.new as { author_id?: string };
          if (row.author_id && row.author_id !== viewerId) {
            setHasNewComments(true);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [thread.id, viewerId]);

  useEffect(() => {
    if (!showThreadMenu) return;
    const handler = (e: MouseEvent) => {
      if (threadMenuRef.current && !threadMenuRef.current.contains(e.target as Node)) {
        setShowThreadMenu(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowThreadMenu(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
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

  const handleToggleBookmark = useCallback(async () => {
    if (bookmarking) return;
    setBookmarking(true);
    const prev = bookmarked;
    setBookmarked(!prev);
    try {
      const res = await fetch("/api/classroom/conversaciones/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.id }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const data = await res.json();
      setBookmarked(data.bookmarked);
    } catch {
      setBookmarked(prev);
    } finally {
      setBookmarking(false);
    }
  }, [bookmarking, bookmarked, thread.id]);

  const handleDeleteThread = useCallback(async () => {
    if (deleting) return;
    if (
      !window.confirm(
        "¿Eliminar esta conversación por completo? Se borrarán la publicación y todos sus comentarios. Esta acción no se puede deshacer.",
      )
    )
      return;
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
    async (body: string, mentions: string[]) => {
      const optimistic: ConversationComment = {
        id: `temp-${Date.now()}`,
        body,
        parent_id: null,
        created_at: new Date().toISOString(),
        author: { id: viewerId, full_name: viewerName, avatar_url: viewerAvatarUrl },
        reaction_count: 0,
        reactions: [],
        viewer_reaction: null,
      };
      setComments((prev) => [...prev, optimistic]);

      try {
        const res = await fetch("/api/classroom/conversaciones/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: thread.id, body, mentions }),
        });
        if (!res.ok) throw new Error("Error al crear comentario");
        const data = await res.json();
        const created: ConversationComment = {
          ...data.comment,
          reaction_count: 0,
          reactions: [],
          viewer_reaction: null,
        };
        setComments((prev) => prev.map((c) => (c.id === optimistic.id ? created : c)));
      } catch {
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      }
    },
    [thread.id, viewerId, viewerName, viewerAvatarUrl],
  );

  const handleAddReply = useCallback(
    async (parentId: string, body: string, mentions: string[]) => {
      const optimistic: ConversationComment = {
        id: `temp-${Date.now()}`,
        body,
        parent_id: parentId,
        created_at: new Date().toISOString(),
        author: { id: viewerId, full_name: viewerName, avatar_url: viewerAvatarUrl },
        reaction_count: 0,
        reactions: [],
        viewer_reaction: null,
      };
      setComments((prev) => [...prev, optimistic]);

      try {
        const res = await fetch("/api/classroom/conversaciones/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: thread.id, body, parentId, mentions }),
        });
        if (!res.ok) throw new Error("Error al crear respuesta");
        const data = await res.json();
        const created: ConversationComment = {
          ...data.comment,
          reaction_count: 0,
          reactions: [],
          viewer_reaction: null,
        };
        setComments((prev) => prev.map((c) => (c.id === optimistic.id ? created : c)));
      } catch {
        setComments((prev) => prev.filter((c) => c.id !== optimistic.id));
      }
    },
    [thread.id, viewerId, viewerName, viewerAvatarUrl],
  );

  const handleDeleteComment = useCallback(async (id: string) => {
    if (!window.confirm("¿Eliminar este comentario? Esta acción no se puede deshacer.")) return;
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
              <div className="flex items-center gap-1.5">
                <p className="text-[13.5px] font-bold text-ca-ink">{thread.author.full_name}</p>
                {thread.author.is_staff && (
                  <span className="shrink-0 rounded-full bg-ca-violet/[0.12] px-1.5 py-0.5 text-[10px] font-bold text-ca-violet">
                    Equipo
                  </span>
                )}
              </div>
              <p className="text-[11.5px] text-ca-ink-soft">{timeAgo(thread.created_at)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-ca-ink/[0.05] px-2 py-0.5 text-[11px] font-semibold text-ca-ink-soft">
              {categoryLabel(thread.category)}
            </span>
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

            <Button
              type="button"
              variant="ghost"
              onClick={handleToggleBookmark}
              disabled={bookmarking}
              aria-pressed={bookmarked}
              aria-label={bookmarked ? "Quitar de guardados" : "Guardar conversación"}
              className={`h-auto min-h-0 gap-1.5 rounded-full px-2.5 py-1 text-[12px] ${
                bookmarked
                  ? "bg-ca-violet/[0.1] text-ca-violet"
                  : "text-ca-ink-soft"
              }`}
            >
              <Bookmark
                size={14}
                fill={bookmarked ? "currentColor" : "none"}
                strokeWidth={bookmarked ? 0 : 1.75}
              />
              {bookmarked ? "Guardado" : "Guardar"}
            </Button>

            {canManageThread && (
              <div className="relative" ref={threadMenuRef}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowThreadMenu(!showThreadMenu)}
                  className="h-auto min-h-0 rounded p-1.5 text-ca-ink-soft"
                  aria-label="Opciones de la conversación"
                  aria-haspopup="menu"
                  aria-expanded={showThreadMenu}
                >
                  <DotsIcon size={18} />
                </Button>
                {showThreadMenu && (
                  <div className="absolute right-0 top-9 z-10 min-w-[170px] rounded-lg border border-ca-ink/[0.08] bg-ca-surface py-1 shadow-lg">
                    {isStaff && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleTogglePinned}
                          disabled={moderating}
                          className="h-auto min-h-0 w-full justify-start rounded-none px-3 py-1.5 text-[12px] text-ca-ink"
                        >
                          {isPinned ? "Quitar fijado" : "📌 Fijar"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleToggleLocked}
                          disabled={moderating}
                          className="h-auto min-h-0 w-full justify-start rounded-none px-3 py-1.5 text-[12px] text-ca-ink"
                        >
                          {isLocked ? "🔓 Reabrir" : "🔒 Cerrar"}
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleDeleteThread}
                      disabled={deleting}
                      className="h-auto min-h-0 w-full justify-start gap-1.5 rounded-none px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
                    >
                      {deleting && <Loader2 size={12} className="animate-spin" />}
                      Eliminar
                    </Button>
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
            reactions={thread.reactions}
            viewerReaction={thread.viewer_reaction}
          />
        </div>
      </div>

      {/* Comentarios */}
      <div className="space-y-5">
        <h2 className="text-[14px] font-bold text-ca-ink">
          {comments.length} {comments.length === 1 ? "comentario" : "comentarios"}
        </h2>

        {hasNewComments && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setHasNewComments(false);
              router.refresh();
            }}
            className="h-auto min-h-0 gap-1.5 rounded-full bg-ca-violet/[0.1] px-3 py-1.5 text-[12px] text-ca-violet hover:bg-ca-violet/[0.16]"
          >
            <RefreshCw size={13} />
            Hay comentarios nuevos
          </Button>
        )}

        {isLocked ? (
          <div className="rounded-lg border border-ca-ink/[0.08] bg-ca-bg-soft px-4 py-3 text-[13px] text-ca-ink-soft">
            Esta conversación está cerrada.
          </div>
        ) : (
          <CommentInput
            initials={viewerInitials}
            avatarUrl={viewerAvatarUrl}
            placeholder="Escribe un comentario…"
            members={members}
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
                members={members}
                memberNames={memberNames}
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
