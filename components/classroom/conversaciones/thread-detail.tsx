"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Bookmark, Loader2, RefreshCw } from "lucide-react";
import type { ThreadDetail as ThreadDetailData, ConversationComment } from "@/lib/conversaciones/queries";
import { categoryLabel } from "@/lib/conversaciones/categories";
import { linkify } from "@/lib/conversaciones/linkify";
import { createClient } from "@/lib/supabase/client";
import { ReactionButton } from "./reaction-button";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { timeAgo } from "@/lib/utils/time-ago";
import { getInitials } from "@/lib/utils/initials";

// ── Miembros (typeahead de menciones) ──────────────────────────

type Member = { id: string; full_name: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compila la regex de menciones `@Nombre` una sola vez por lista de
 * miembros (T17: antes se reconstruía en cada render de cada comentario).
 * Filtra nombres vacíos y prefiere el match más largo primero.
 */
function buildMentionRegex(memberNames: string[]): RegExp | null {
  const validNames = memberNames.filter((n) => n.trim().length > 0);
  if (validNames.length === 0) return null;
  const sorted = [...validNames].sort((a, b) => b.length - a.length);
  return new RegExp(`(@(?:${sorted.map(escapeRegExp).join("|")}))`, "g");
}

/**
 * Renderiza el cuerpo de un comentario resaltando las menciones `@Nombre`
 * (violeta) con la regex ya compilada, y aplica `linkify` al resto del texto
 * para no romper los enlaces. Sin regex (sin miembros), cae a `linkify`.
 */
function renderWithMentions(text: string, mentionRegex: RegExp | null): ReactNode {
  if (!mentionRegex) return linkify(text);

  const parts = text.split(mentionRegex);

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
  onSubmit: (body: string, mentions: string[]) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(autoFocus);
  const [submitting, setSubmitting] = useState(false);
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

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    // Solo las menciones cuyo "@Nombre" sigue presente en el texto final.
    const kept = mentions.filter((id) => {
      const name = members.find((m) => m.id === id)?.full_name;
      return name ? trimmed.includes(`@${name}`) : false;
    });
    setSubmitting(true);
    try {
      await onSubmit(trimmed, kept);
      setValue("");
      setMentions([]);
      setMentionQuery(null);
      setFocused(false);
    } catch {
      // El error ya se muestra arriba (banner del padre); conserva el texto
      // para que el usuario pueda reintentar sin retipear.
    } finally {
      setSubmitting(false);
    }
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
      void handleSubmit();
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
          disabled={submitting}
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
              disabled={submitting}
              className="h-auto min-h-0 rounded-lg px-3 py-1.5 text-[12px]"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleSubmit()}
              disabled={!value.trim() || submitting}
              className="h-auto min-h-0 gap-1.5 rounded-lg px-4 py-1.5 text-[12px]"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Comentar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Menú de moderación (Editar/Eliminar) de un comentario/reply ─────

function CommentMenu({
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  size = 16,
}: {
  canEdit: boolean;
  canDelete: boolean;
  onEdit?: () => void;
  onDelete: () => void;
  size?: number;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  if (!canEdit && !canDelete) return null;

  return (
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
        <DotsIcon size={size} />
      </Button>
      {showMenu && (
        <div className="absolute right-0 top-7 z-10 min-w-[120px] rounded-lg border border-ca-ink/[0.08] bg-ca-surface py-1 shadow-lg">
          {canEdit && onEdit && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onEdit();
                setShowMenu(false);
              }}
              className="h-auto min-h-0 w-full justify-start rounded-none px-3 py-1.5 text-[12px] text-ca-ink"
            >
              Editar
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onDelete();
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
  );
}

// ── Formulario inline de edición (comentario/reply) ─────────────

function CommentEditForm({
  initialValue,
  onSave,
  onCancel,
  compact = false,
}: {
  initialValue: string;
  onSave: (body: string) => Promise<void>;
  onCancel: () => void;
  compact?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch {
      setError("No se pudo guardar el cambio. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={compact ? 2 : 3}
        maxLength={5000}
        disabled={saving}
        aria-label="Editar comentario"
        className="resize-none rounded-lg px-3 py-2 text-[13px]"
      />
      {error && <p className="mt-1 text-[11.5px] text-red-600">{error}</p>}
      <div className="mt-1.5 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={saving}
          className="h-auto min-h-0 rounded-lg px-3 py-1 text-[11.5px]"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void handleSave()}
          disabled={saving || !value.trim()}
          className="h-auto min-h-0 gap-1.5 rounded-lg px-3 py-1 text-[11.5px]"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          Guardar
        </Button>
      </div>
    </div>
  );
}

// ── Reply Item (nested) ─────────────────────────────────────────

function ReplyItem({
  reply,
  viewerId,
  mentionRegex,
  isStaff,
  onDelete,
  onEdit,
}: {
  reply: ConversationComment;
  viewerId: string;
  mentionRegex: RegExp | null;
  isStaff: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string, body: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const isOwn = reply.author.id === viewerId;
  const initials = getInitials(reply.author.full_name);

  if (reply.deleted) {
    return (
      <div className="mb-3 flex gap-3">
        <Avatar initials="—" avatarUrl={null} isCurrentUser={false} size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] italic text-ca-ink-soft">Comentario eliminado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="group mb-3 flex gap-3">
      <Avatar initials={initials} avatarUrl={reply.author.avatar_url} isCurrentUser={isOwn} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-ca-ink">{reply.author.full_name}</span>
          <span className="text-[10px] text-ca-ink-soft">
            {timeAgo(reply.created_at)}
            {reply.edited_at && " · editado"}
          </span>
        </div>
        {editing ? (
          <CommentEditForm
            initialValue={reply.body}
            onCancel={() => setEditing(false)}
            onSave={async (body) => {
              await onEdit(reply.id, body);
              setEditing(false);
            }}
            compact
          />
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ca-ink">
            {renderWithMentions(reply.body, mentionRegex)}
          </p>
        )}
        <div className="mt-1">
          <ReactionButton
            targetType="comment"
            targetId={reply.id}
            reactions={reply.reactions}
            viewerReaction={reply.viewer_reaction}
          />
        </div>
      </div>

      {!editing && (
        <CommentMenu
          canEdit={isOwn}
          canDelete={isOwn || isStaff}
          onEdit={() => setEditing(true)}
          onDelete={() => onDelete(reply.id)}
          size={14}
        />
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
  mentionRegex,
  isStaff,
  onReply,
  onDelete,
  onEdit,
}: {
  comment: ConversationComment;
  viewerId: string;
  viewerInitials: string;
  viewerAvatarUrl?: string | null;
  locked: boolean;
  replies: ConversationComment[];
  members: Member[];
  mentionRegex: RegExp | null;
  isStaff: boolean;
  onReply: (parentId: string, body: string, mentions: string[]) => Promise<void>;
  onDelete: (id: string) => void;
  onEdit: (id: string, body: string) => Promise<void>;
}) {
  const [showReplies, setShowReplies] = useState(replies.length <= 2);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [editing, setEditing] = useState(false);

  const isOwn = comment.author.id === viewerId;
  const authorInitials = getInitials(comment.author.full_name);

  if (comment.deleted) {
    return (
      <div className="group">
        <div className="flex gap-3">
          <Avatar initials="—" avatarUrl={null} isCurrentUser={false} size={32} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] italic text-ca-ink-soft">Comentario eliminado</p>
          </div>
        </div>

        {replies.length > 0 && (
          <div className="ml-[44px] mt-3 border-l-2 border-ca-violet/20 pl-4">
            {replies.map((reply) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                viewerId={viewerId}
                mentionRegex={mentionRegex}
                isStaff={isStaff}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="group">
      <div className="flex gap-3">
        <Avatar initials={authorInitials} avatarUrl={comment.author.avatar_url} isCurrentUser={isOwn} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-ca-ink">{comment.author.full_name}</span>
            <span className="text-[11px] text-ca-ink-soft">
              {timeAgo(comment.created_at)}
              {comment.edited_at && " · editado"}
            </span>
          </div>

          {editing ? (
            <CommentEditForm
              initialValue={comment.body}
              onCancel={() => setEditing(false)}
              onSave={async (body) => {
                await onEdit(comment.id, body);
                setEditing(false);
              }}
            />
          ) : (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ca-ink">
              {renderWithMentions(comment.body, mentionRegex)}
            </p>
          )}

          <div className="mt-1.5 flex items-center gap-3">
            <ReactionButton
              targetType="comment"
              targetId={comment.id}
              reactions={comment.reactions}
              viewerReaction={comment.viewer_reaction}
            />
            {!locked && !editing && (
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

        {!editing && (
          <CommentMenu
            canEdit={isOwn}
            canDelete={isOwn || isStaff}
            onEdit={() => setEditing(true)}
            onDelete={() => onDelete(comment.id)}
          />
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
              mentionRegex={mentionRegex}
              isStaff={isStaff}
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

      {showReplyInput && !locked && (
        <div className="ml-[44px] mt-3">
          <CommentInput
            initials={viewerInitials}
            avatarUrl={viewerAvatarUrl}
            placeholder="Escribe una respuesta…"
            members={members}
            onSubmit={async (body, mentions) => {
              await onReply(comment.id, body, mentions);
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
  thread: ThreadDetailData;
  /** Cuerpo del hilo ya renderizado en el server (Markdown) — evita mandar el
   *  parser de markdown al cliente en la ruta más pesada del classroom. */
  bodyRendered: ReactNode;
  initialComments: ConversationComment[];
  initialHasMoreComments: boolean;
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
  initialHasMoreComments,
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
  const [hasMoreComments, setHasMoreComments] = useState(initialHasMoreComments);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [showThreadMenu, setShowThreadMenu] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [hasNewComments, setHasNewComments] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingThread, setEditingThread] = useState(false);
  const [threadTitleDraft, setThreadTitleDraft] = useState(thread.title);
  const [threadBodyDraft, setThreadBodyDraft] = useState(thread.body);
  const [savingThreadEdit, setSavingThreadEdit] = useState(false);
  const [threadEditError, setThreadEditError] = useState<string | null>(null);
  const threadMenuRef = useRef<HTMLDivElement>(null);

  const isAuthor = thread.author.id === viewerId;
  const canManageThread = isStaff || isAuthor;

  const memberNames = useMemo(() => members.map((m) => m.full_name), [members]);
  const mentionRegex = useMemo(() => buildMentionRegex(memberNames), [memberNames]);

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

  // ── Edición del thread (título/cuerpo propios) ──────────────

  const handleStartEditThread = useCallback(() => {
    setThreadTitleDraft(thread.title);
    setThreadBodyDraft(thread.body);
    setThreadEditError(null);
    setEditingThread(true);
    setShowThreadMenu(false);
  }, [thread.title, thread.body]);

  const handleSaveThreadEdit = useCallback(async () => {
    const title = threadTitleDraft.trim();
    const body = threadBodyDraft.trim();
    if (!title || !body) return;
    setSavingThreadEdit(true);
    setThreadEditError(null);
    try {
      const res = await fetch(`/api/classroom/conversaciones/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) throw new Error("Error al editar la conversación");
      setEditingThread(false);
      // El body se renderiza como Markdown en el server (bodyRendered): un
      // refresh trae el nuevo título/cuerpo/edited_at ya resueltos.
      router.refresh();
    } catch {
      setThreadEditError("No se pudo guardar el cambio. Intenta de nuevo.");
    } finally {
      setSavingThreadEdit(false);
    }
  }, [threadTitleDraft, threadBodyDraft, thread.id, router]);

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
      setActionError(null);
      const optimisticId = crypto.randomUUID();
      const optimistic: ConversationComment = {
        id: optimisticId,
        body,
        parent_id: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted: false,
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
        const created: ConversationComment = { ...data.comment };
        setComments((prev) => prev.map((c) => (c.id === optimisticId ? created : c)));
      } catch (err) {
        setComments((prev) => prev.filter((c) => c.id !== optimisticId));
        setActionError("No se pudo publicar el comentario. Intenta de nuevo.");
        throw err;
      }
    },
    [thread.id, viewerId, viewerName, viewerAvatarUrl],
  );

  const handleAddReply = useCallback(
    async (parentId: string, body: string, mentions: string[]) => {
      setActionError(null);
      const optimisticId = crypto.randomUUID();
      const optimistic: ConversationComment = {
        id: optimisticId,
        body,
        parent_id: parentId,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted: false,
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
        const created: ConversationComment = { ...data.comment };
        setComments((prev) => prev.map((c) => (c.id === optimisticId ? created : c)));
      } catch (err) {
        setComments((prev) => prev.filter((c) => c.id !== optimisticId));
        setActionError("No se pudo publicar la respuesta. Intenta de nuevo.");
        throw err;
      }
    },
    [thread.id, viewerId, viewerName, viewerAvatarUrl],
  );

  const handleEditComment = useCallback(async (id: string, body: string) => {
    const res = await fetch("/api/classroom/conversaciones/comments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, body }),
    });
    if (!res.ok) throw new Error("Error al editar comentario");
    const data = await res.json();
    setComments((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, body: data.comment.body, edited_at: data.comment.edited_at } : c,
      ),
    );
  }, []);

  const handleDeleteComment = useCallback(async (id: string) => {
    if (!window.confirm("¿Eliminar este comentario? Esta acción no se puede deshacer.")) return;
    setActionError(null);
    const backup = commentsRef.current;
    // Soft delete: preserva la fila (y sus respuestas) marcándola como
    // eliminada en vez de removerla del árbol.
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, deleted: true, body: "" } : c)));

    try {
      const res = await fetch(`/api/classroom/conversaciones/comments?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error al eliminar");
    } catch {
      setComments(backup);
      setActionError("No se pudo eliminar el comentario. Intenta de nuevo.");
    }
  }, []);

  const handleLoadMoreComments = useCallback(async () => {
    if (loadingMoreComments || !hasMoreComments) return;
    const oldestRoot = commentsRef.current.find((c) => !c.parent_id);
    if (!oldestRoot) {
      setHasMoreComments(false);
      return;
    }
    setLoadingMoreComments(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/classroom/conversaciones/${thread.id}?before=${encodeURIComponent(oldestRoot.created_at)}`,
      );
      if (!res.ok) throw new Error("Error al cargar más comentarios");
      const data = await res.json();
      const older = (data.comments ?? []) as ConversationComment[];
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...older.filter((c) => !seen.has(c.id)), ...prev];
      });
      setHasMoreComments(Boolean(data.hasMoreComments));
    } catch {
      setActionError("No se pudieron cargar más comentarios. Intenta de nuevo.");
    } finally {
      setLoadingMoreComments(false);
    }
  }, [loadingMoreComments, hasMoreComments, thread.id]);

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
              <p className="text-[11.5px] text-ca-ink-soft">
                {timeAgo(thread.created_at)}
                {thread.edited_at && " · editado"}
              </p>
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

            {canManageThread && !editingThread && (
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
                    {isAuthor && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleStartEditThread}
                        className="h-auto min-h-0 w-full justify-start rounded-none px-3 py-1.5 text-[12px] text-ca-ink"
                      >
                        Editar
                      </Button>
                    )}
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

        {editingThread ? (
          <div className="mt-4 flex flex-col gap-2">
            <Input
              value={threadTitleDraft}
              onChange={(e) => setThreadTitleDraft(e.target.value)}
              maxLength={200}
              aria-label="Título de la conversación"
              disabled={savingThreadEdit}
              className="rounded-lg px-3 py-2 text-[16px] font-bold"
            />
            <Textarea
              value={threadBodyDraft}
              onChange={(e) => setThreadBodyDraft(e.target.value)}
              rows={6}
              maxLength={10000}
              aria-label="Contenido de la conversación"
              disabled={savingThreadEdit}
              className="resize-none rounded-lg px-3 py-2 text-[13.5px] leading-relaxed"
            />
            {threadEditError && <p className="text-[12px] text-red-600">{threadEditError}</p>}
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingThread(false)}
                disabled={savingThreadEdit}
                className="h-auto min-h-0 rounded-lg px-3 py-1.5 text-[12px]"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleSaveThreadEdit()}
                disabled={savingThreadEdit || !threadTitleDraft.trim() || !threadBodyDraft.trim()}
                className="h-auto min-h-0 gap-1.5 rounded-lg px-4 py-1.5 text-[12px]"
              >
                {savingThreadEdit && <Loader2 size={14} className="animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="mt-4 text-[22px] font-black leading-tight tracking-tight text-ca-ink md:text-[26px]">
              {thread.title}
            </h1>
            <div className="mt-3">{bodyRendered}</div>
          </>
        )}

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
          {thread.comment_count} {thread.comment_count === 1 ? "comentario" : "comentarios"}
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

        {actionError && <p className="text-[12.5px] text-red-600">{actionError}</p>}

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

        {hasMoreComments && (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleLoadMoreComments()}
              disabled={loadingMoreComments}
              className="h-auto min-h-0 gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-ca-ink-soft"
            >
              {loadingMoreComments && <Loader2 size={13} className="animate-spin" />}
              Cargar más comentarios
            </Button>
          </div>
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
                mentionRegex={mentionRegex}
                isStaff={isStaff}
                onReply={handleAddReply}
                onDelete={handleDeleteComment}
                onEdit={handleEditComment}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
