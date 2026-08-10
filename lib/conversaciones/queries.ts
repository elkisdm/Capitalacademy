import { createClient } from "@/lib/supabase/server";
import { resolveRef } from "@/lib/classroom/ref";
import { getPublicAuthorsMap } from "@/lib/profiles/public-authors";
import { getProgramStaffIds } from "@/lib/profiles/program-staff";
import { REACTION_EMOJIS } from "@/lib/conversaciones/reactions";

export type ReactionCount = { emoji: string; count: number };

export type ThreadAuthor = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  is_staff?: boolean;
};

export type ThreadListItem = {
  id: string;
  /** Slug legible del hilo para la URL (0090). */
  slug?: string | null;
  title: string;
  body: string;
  category: string;
  is_pinned: boolean;
  is_locked: boolean;
  comment_count: number;
  last_activity_at: string;
  created_at: string;
  author: ThreadAuthor;
  reaction_count: number;
  reactions: ReactionCount[];
  viewer_reaction: string | null;
  viewer_bookmarked: boolean;
};

export type ConversationComment = {
  id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
  edited_at: string | null;
  /** true si el comentario está soft-deleted (body vacío) — el cliente
   *  renderiza un placeholder preservando las respuestas. */
  deleted: boolean;
  author: ThreadAuthor;
  reaction_count: number;
  reactions: ReactionCount[];
  viewer_reaction: string | null;
};

export type ThreadDetail = {
  id: string;
  program_id: string;
  title: string;
  body: string;
  category: string;
  is_pinned: boolean;
  is_locked: boolean;
  comment_count: number;
  last_activity_at: string;
  created_at: string;
  edited_at: string | null;
  author: ThreadAuthor;
  reaction_count: number;
  reactions: ReactionCount[];
  viewer_reaction: string | null;
  viewer_bookmarked: boolean;
};

/** Cursor de paginación keyset para el feed 'recent' (evita que .range(offset)
 *  "salte"/duplique hilos cuando cambia el orden entre páginas). */
export type RecentThreadsCursor = {
  isPinned: boolean;
  lastActivityAt: string;
  id: string;
};

const DEFAULT_LIST_LIMIT = 50;
// Set acotado para 'top'/'unanswered' y para búsqueda: a escala de cohortes
// de 8-40 alumnos basta con reordenar/filtrar en JS un lote más grande que
// depender de `reaction_count` denormalizado (follow-up documentado si la
// escala crece).
const BOUNDED_SET_CAP = 200;
const DEFAULT_COMMENTS_PAGE = 20;

const FALLBACK_AUTHOR: ThreadAuthor = {
  id: "",
  full_name: "Usuario",
  avatar_url: null,
  is_staff: false,
};

type ReactionStats = {
  counts: ReactionCount[];
  total: number;
  viewerReaction: string | null;
};

const EMPTY_REACTION_STATS: ReactionStats = {
  counts: [],
  total: 0,
  viewerReaction: null,
};

/**
 * Agrupa reacciones por emoji para cada target (thread o comentario) con una
 * sola query a `conversation_reactions` y agregación en JS — evita el
 * embedded-count de PostgREST (menos robusto ante RLS y ordenamientos).
 * `column` decide si el `.in()` filtra por `thread_id` o `comment_id`; la otra
 * columna queda null en cada fila y no matchea el IN, así que no hace falta
 * filtrarla aparte. `counts` sale ordenado según REACTION_EMOJIS; `total` sigue
 * sirviendo para el orden "Populares"; `viewerReaction` es el emoji del viewer.
 */
async function getReactionStatsMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  column: "thread_id" | "comment_id",
  ids: string[],
  viewerId: string,
): Promise<Map<string, ReactionStats>> {
  const map = new Map<string, ReactionStats>();
  if (ids.length === 0) return map;

  const { data } = await supabase
    .from("conversation_reactions")
    .select("thread_id, comment_id, user_id, emoji")
    .in(column, ids);

  const acc = new Map<
    string,
    { counts: Map<string, number>; total: number; viewerReaction: string | null }
  >();

  for (const row of (data ?? []) as Array<{
    thread_id: string | null;
    comment_id: string | null;
    user_id: string;
    emoji: string;
  }>) {
    const targetId = column === "thread_id" ? row.thread_id : row.comment_id;
    if (!targetId) continue;
    const entry =
      acc.get(targetId) ?? { counts: new Map<string, number>(), total: 0, viewerReaction: null };
    entry.counts.set(row.emoji, (entry.counts.get(row.emoji) ?? 0) + 1);
    entry.total += 1;
    if (row.user_id === viewerId) entry.viewerReaction = row.emoji;
    acc.set(targetId, entry);
  }

  for (const [targetId, entry] of acc) {
    const counts = REACTION_EMOJIS.filter((e) => (entry.counts.get(e) ?? 0) > 0).map((e) => ({
      emoji: e,
      count: entry.counts.get(e) as number,
    }));
    map.set(targetId, { counts, total: entry.total, viewerReaction: entry.viewerReaction });
  }

  return map;
}

/**
 * Devuelve el set de `thread_id` guardados por el viewer entre los `ids` dados.
 * RLS de `conversation_bookmarks` ya filtra a user_id = auth.uid(), pero
 * mantenemos el `.eq("user_id")` explícito por claridad.
 */
async function getBookmarkedSet(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
  viewerId: string,
): Promise<Set<string>> {
  const set = new Set<string>();
  if (ids.length === 0) return set;

  const { data } = await supabase
    .from("conversation_bookmarks")
    .select("thread_id")
    .eq("user_id", viewerId)
    .in("thread_id", ids);

  for (const row of (data ?? []) as Array<{ thread_id: string }>) {
    set.add(row.thread_id);
  }

  return set;
}

/**
 * Cuenta comentarios NO borrados por hilo. El contador denormalizado
 * (`conversation_threads.comment_count`) no baja al soft-delete (es solo un
 * UPDATE, no un DELETE real — el trigger de actividad únicamente lo
 * incrementa en INSERT), así que se recalcula acá para no mostrar un total
 * inflado ("conteo visible", T12).
 */
async function getVisibleCommentCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  threadIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (threadIds.length === 0) return map;

  const { data } = await supabase
    .from("conversation_comments")
    .select("thread_id")
    .in("thread_id", threadIds)
    .is("deleted_at", null);

  for (const row of (data ?? []) as Array<{ thread_id: string }>) {
    map.set(row.thread_id, (map.get(row.thread_id) ?? 0) + 1);
  }
  return map;
}

type ThreadRow = {
  id: string;
  title: string;
  body: string;
  category: string;
  is_pinned: boolean;
  is_locked: boolean;
  comment_count: number;
  last_activity_at: string;
  created_at: string;
  author_id: string;
};

type ThreadDetailRow = ThreadRow & { program_id: string; edited_at: string | null };

type CommentRow = {
  id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author_id: string;
};

// El autor NO se embebe vía RLS (la policy de `profiles` está cerrada a
// dueño+staff, 0045). Se trae solo author_id y se resuelve el autor público
// (id/nombre/avatar) por service-role con getPublicAuthorsMap.
const THREAD_SELECT = `
  id, slug, title, body, category, is_pinned, is_locked, comment_count,
  last_activity_at, created_at, author_id
`;

const COMMENT_SELECT = `
  id, body, parent_id, created_at, edited_at, deleted_at, author_id
`;

/** Escapa el valor para un filtro `.or(...)` de PostgREST: envolver en
 *  comillas dobles evita que comas/paréntesis del término de búsqueda
 *  rompan el parseo del filtro (sintaxis documentada de PostgREST). */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** Construye el filtro `.or(...)` de comparación lexicográfica
 *  (is_pinned, last_activity_at, id) DESC "estrictamente después de" el
 *  cursor — keyset pagination para el feed 'recent' (hallazgo 15: `.range()`
 *  podía saltar/duplicar hilos si cambiaban de orden entre páginas). */
function buildRecentCursorFilter(cursor: RecentThreadsCursor): string {
  const pinned = cursor.isPinned ? "true" : "false";
  const activity = quoteFilterValue(cursor.lastActivityAt);
  return [
    `is_pinned.lt.${pinned}`,
    `and(is_pinned.eq.${pinned},last_activity_at.lt.${activity})`,
    `and(is_pinned.eq.${pinned},last_activity_at.eq.${activity},id.lt.${cursor.id})`,
  ].join(",");
}

/**
 * Feed de un programa (ADR-0010: por programa, no por cohorte). RLS
 * (`has_program_access`) ya filtra a matrícula active/completed o staff.
 *
 * - sort 'recent' (default): keyset pagination real vía `cursor` (is_pinned
 *   desc, last_activity_at desc, id desc).
 * - sort 'top'/'unanswered', o con `q`: usa un set acotado (`BOUNDED_SET_CAP`)
 *   reordenado/filtrado en JS — sin paginación adicional en esta pasada.
 * - `q`: búsqueda server-side vía `ilike` sobre `title`/`body`.
 *
 * Propaga errores de BD (antes se tragaba con `return []`, indistinguible de
 * "sin conversaciones" — hallazgo 19); el caller decide cómo mostrarlo.
 */
export async function getProgramThreads(
  programId: string,
  viewerId: string,
  opts?: {
    sort?: "recent" | "top" | "unanswered";
    limit?: number;
    q?: string;
    cursor?: RecentThreadsCursor | null;
  },
): Promise<ThreadListItem[]> {
  const supabase = await createClient();
  const sort = opts?.sort ?? "recent";
  const q = opts?.q?.trim() ?? "";
  const usesBoundedSet = sort !== "recent" || q.length > 0;

  let query = supabase.from("conversation_threads").select(THREAD_SELECT).eq("program_id", programId);

  if (q) {
    query = query.or(`title.ilike.${quoteFilterValue(`%${q}%`)},body.ilike.${quoteFilterValue(`%${q}%`)}`);
  }

  if (usesBoundedSet) {
    query = query.order("last_activity_at", { ascending: false }).limit(opts?.limit ?? BOUNDED_SET_CAP);
  } else {
    query = query
      .order("is_pinned", { ascending: false })
      .order("last_activity_at", { ascending: false })
      .order("id", { ascending: false });
    if (opts?.cursor) {
      query = query.or(buildRecentCursorFilter(opts.cursor));
    }
    query = query.limit(opts?.limit ?? DEFAULT_LIST_LIMIT);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getProgramThreads: ${error.message}`);
  if (!data) return [];

  const threads = data as unknown as ThreadRow[];
  const threadIds = threads.map((t) => t.id);
  const [reactionMap, authorsMap, bookmarkedSet, staffIds, visibleCounts] = await Promise.all([
    getReactionStatsMap(supabase, "thread_id", threadIds, viewerId),
    getPublicAuthorsMap(threads.map((t) => t.author_id)),
    getBookmarkedSet(supabase, threadIds, viewerId),
    getProgramStaffIds(programId),
    getVisibleCommentCounts(supabase, threadIds),
  ]);

  let items: ThreadListItem[] = threads.map((t) => {
    const stats = reactionMap.get(t.id) ?? EMPTY_REACTION_STATS;
    const author = authorsMap.get(t.author_id) ?? FALLBACK_AUTHOR;
    return {
      id: t.id,
      title: t.title,
      body: t.body,
      category: t.category,
      is_pinned: t.is_pinned,
      is_locked: t.is_locked,
      comment_count: visibleCounts.get(t.id) ?? 0,
      last_activity_at: t.last_activity_at,
      created_at: t.created_at,
      author: { ...author, is_staff: author.is_staff || staffIds.has(t.author_id) },
      reaction_count: stats.total,
      reactions: stats.counts,
      viewer_reaction: stats.viewerReaction,
      viewer_bookmarked: bookmarkedSet.has(t.id),
    };
  });

  if (sort === "top") {
    items = [...items].sort((a, b) => b.reaction_count - a.reaction_count);
  } else if (sort === "unanswered") {
    items = items
      .filter((t) => t.comment_count === 0)
      .sort(
        (a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime(),
      );
  }

  return items;
}

/**
 * Detalle de un thread + sus comentarios paginados (root-level: cada página
 * trae comentarios raíz + TODAS sus respuestas, para no dejar respuestas
 * huérfanas de un padre no cargado). Devuelve null si el thread no existe o
 * RLS lo oculta (programa distinto al del viewer) — el caller hace notFound().
 */
export async function getThreadWithComments(
  threadId: string,
  viewerId: string,
  opts?: { commentsLimit?: number; commentsBefore?: string },
): Promise<
  { thread: ThreadDetail; comments: ConversationComment[]; hasMoreComments: boolean } | null
> {
  const supabase = await createClient();

  // Acepta el slug legible (0090) o el UUID: las notificaciones ya enviadas
  // llevan el UUID en /classroom/go/thread/<id>.
  const ref = resolveRef(threadId);
  if (!ref) return null;

  const { data: threadData, error } = await supabase
    .from("conversation_threads")
    .select(`program_id, edited_at, ${THREAD_SELECT}`)
    .eq(ref.column, ref.value)
    .maybeSingle();

  if (error || !threadData) return null;

  const threadRow = threadData as unknown as ThreadDetailRow;
  // A partir de acá SIEMPRE el id real de la fila, nunca el parámetro de la URL:
  // desde la 0090 ese parámetro suele ser el slug, y compararlo contra columnas
  // uuid (thread_id, reacciones, marcadores, conteos) es un 22P02 que PostgREST
  // devuelve como 400. Como esos errores no se inspeccionan, el hilo se veía
  // pero sin ningún comentario, con contador y reacciones en cero.
  const realId = threadRow.id;
  const limit = opts?.commentsLimit ?? DEFAULT_COMMENTS_PAGE;

  let rootQuery = supabase
    .from("conversation_comments")
    .select(COMMENT_SELECT)
    .eq("thread_id", realId)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (opts?.commentsBefore) {
    rootQuery = rootQuery.lt("created_at", opts.commentsBefore);
  }

  const { data: rootData } = await rootQuery;
  const rootDesc = (rootData ?? []) as unknown as CommentRow[];
  const hasMoreComments = rootDesc.length > limit;
  const rootRows = rootDesc.slice(0, limit).reverse(); // ascendente para mostrar
  const rootIds = rootRows.map((r) => r.id);

  let replyRows: CommentRow[] = [];
  if (rootIds.length > 0) {
    const { data: replyData } = await supabase
      .from("conversation_comments")
      .select(COMMENT_SELECT)
      .in("parent_id", rootIds)
      .order("created_at", { ascending: true });
    replyRows = (replyData ?? []) as unknown as CommentRow[];
  }

  const commentRows = [...rootRows, ...replyRows];
  const commentIds = commentRows.map((c) => c.id);

  const [threadReactions, commentReactions, authorsMap, bookmarkedSet, staffIds, visibleCounts] =
    await Promise.all([
      getReactionStatsMap(supabase, "thread_id", [realId], viewerId),
      getReactionStatsMap(supabase, "comment_id", commentIds, viewerId),
      getPublicAuthorsMap([
        threadRow.author_id,
        ...commentRows.map((c) => c.author_id),
      ]),
      getBookmarkedSet(supabase, [realId], viewerId),
      getProgramStaffIds(threadRow.program_id),
      getVisibleCommentCounts(supabase, [realId]),
    ]);

  const threadStats = threadReactions.get(realId) ?? EMPTY_REACTION_STATS;
  const threadAuthor = authorsMap.get(threadRow.author_id) ?? FALLBACK_AUTHOR;

  const thread: ThreadDetail = {
    id: threadRow.id,
    program_id: threadRow.program_id,
    title: threadRow.title,
    body: threadRow.body,
    category: threadRow.category,
    is_pinned: threadRow.is_pinned,
    is_locked: threadRow.is_locked,
    comment_count: visibleCounts.get(realId) ?? 0,
    last_activity_at: threadRow.last_activity_at,
    created_at: threadRow.created_at,
    edited_at: threadRow.edited_at,
    author: {
      ...threadAuthor,
      is_staff: threadAuthor.is_staff || staffIds.has(threadRow.author_id),
    },
    reaction_count: threadStats.total,
    reactions: threadStats.counts,
    viewer_reaction: threadStats.viewerReaction,
    viewer_bookmarked: bookmarkedSet.has(realId),
  };

  const comments: ConversationComment[] = commentRows.map((c) => {
    const stats = commentReactions.get(c.id) ?? EMPTY_REACTION_STATS;
    const author = authorsMap.get(c.author_id) ?? FALLBACK_AUTHOR;
    return {
      id: c.id,
      body: c.deleted_at ? "" : c.body,
      parent_id: c.parent_id,
      created_at: c.created_at,
      edited_at: c.edited_at,
      deleted: c.deleted_at !== null,
      author: { ...author, is_staff: author.is_staff || staffIds.has(c.author_id) },
      reaction_count: stats.total,
      reactions: stats.counts,
      viewer_reaction: stats.viewerReaction,
    };
  });

  return { thread, comments, hasMoreComments };
}
