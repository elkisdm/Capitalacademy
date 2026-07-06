import { createClient } from "@/lib/supabase/server";
import { getPublicAuthorsMap } from "@/lib/profiles/public-authors";
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
  author: ThreadAuthor;
  reaction_count: number;
  reactions: ReactionCount[];
  viewer_reaction: string | null;
  viewer_bookmarked: boolean;
};

const DEFAULT_LIST_LIMIT = 50;

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

type ThreadDetailRow = ThreadRow & { program_id: string };

type CommentRow = {
  id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
  author_id: string;
};

// El autor NO se embebe vía RLS (la policy de `profiles` está cerrada a
// dueño+staff, 0045). Se trae solo author_id y se resuelve el autor público
// (id/nombre/avatar) por service-role con getPublicAuthorsMap.
const THREAD_SELECT = `
  id, title, body, category, is_pinned, is_locked, comment_count,
  last_activity_at, created_at, author_id
`;

const COMMENT_SELECT = `
  id, body, parent_id, created_at, author_id
`;

/**
 * Feed de un programa (ADR-0010: por programa, no por cohorte). RLS
 * (`has_program_access`) ya filtra a matrícula active/completed o staff.
 * sort 'recent' (default) = pinned desc, last_activity_at desc (orden de BD).
 * sort 'top' = misma página, re-ordenada en JS por reaction_count desc.
 */
export async function getProgramThreads(
  programId: string,
  viewerId: string,
  opts?: { sort?: "recent" | "top"; limit?: number; offset?: number },
): Promise<ThreadListItem[]> {
  const supabase = await createClient();
  const limit = opts?.limit ?? DEFAULT_LIST_LIMIT;
  const offset = opts?.offset ?? 0;

  const { data, error } = await supabase
    .from("conversation_threads")
    .select(THREAD_SELECT)
    .eq("program_id", programId)
    .order("is_pinned", { ascending: false })
    .order("last_activity_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !data) return [];

  const threads = data as unknown as ThreadRow[];
  const threadIds = threads.map((t) => t.id);
  const [reactionMap, authorsMap, bookmarkedSet] = await Promise.all([
    getReactionStatsMap(supabase, "thread_id", threadIds, viewerId),
    getPublicAuthorsMap(threads.map((t) => t.author_id)),
    getBookmarkedSet(supabase, threadIds, viewerId),
  ]);

  const items: ThreadListItem[] = threads.map((t) => {
    const stats = reactionMap.get(t.id) ?? EMPTY_REACTION_STATS;
    return {
      id: t.id,
      title: t.title,
      body: t.body,
      category: t.category,
      is_pinned: t.is_pinned,
      is_locked: t.is_locked,
      comment_count: t.comment_count,
      last_activity_at: t.last_activity_at,
      created_at: t.created_at,
      author: authorsMap.get(t.author_id) ?? FALLBACK_AUTHOR,
      reaction_count: stats.total,
      reactions: stats.counts,
      viewer_reaction: stats.viewerReaction,
      viewer_bookmarked: bookmarkedSet.has(t.id),
    };
  });

  if (opts?.sort === "top") {
    items.sort((a, b) => b.reaction_count - a.reaction_count);
  }

  return items;
}

/**
 * Detalle de un thread + sus comentarios (1 nivel vía parent_id). Devuelve
 * null si el thread no existe o RLS lo oculta (programa distinto al del
 * viewer) — el caller hace notFound().
 */
export async function getThreadWithComments(
  threadId: string,
  viewerId: string,
): Promise<{ thread: ThreadDetail; comments: ConversationComment[] } | null> {
  const supabase = await createClient();

  const { data: threadData, error } = await supabase
    .from("conversation_threads")
    .select(`program_id, ${THREAD_SELECT}`)
    .eq("id", threadId)
    .maybeSingle();

  if (error || !threadData) return null;

  const threadRow = threadData as unknown as ThreadDetailRow;

  const { data: commentData } = await supabase
    .from("conversation_comments")
    .select(COMMENT_SELECT)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const commentRows = (commentData ?? []) as unknown as CommentRow[];
  const commentIds = commentRows.map((c) => c.id);

  const [threadReactions, commentReactions, authorsMap, bookmarkedSet] =
    await Promise.all([
      getReactionStatsMap(supabase, "thread_id", [threadId], viewerId),
      getReactionStatsMap(supabase, "comment_id", commentIds, viewerId),
      getPublicAuthorsMap([
        threadRow.author_id,
        ...commentRows.map((c) => c.author_id),
      ]),
      getBookmarkedSet(supabase, [threadId], viewerId),
    ]);

  const threadStats = threadReactions.get(threadId) ?? EMPTY_REACTION_STATS;

  const thread: ThreadDetail = {
    id: threadRow.id,
    program_id: threadRow.program_id,
    title: threadRow.title,
    body: threadRow.body,
    category: threadRow.category,
    is_pinned: threadRow.is_pinned,
    is_locked: threadRow.is_locked,
    comment_count: threadRow.comment_count,
    last_activity_at: threadRow.last_activity_at,
    created_at: threadRow.created_at,
    author: authorsMap.get(threadRow.author_id) ?? FALLBACK_AUTHOR,
    reaction_count: threadStats.total,
    reactions: threadStats.counts,
    viewer_reaction: threadStats.viewerReaction,
    viewer_bookmarked: bookmarkedSet.has(threadId),
  };

  const comments: ConversationComment[] = commentRows.map((c) => {
    const stats = commentReactions.get(c.id) ?? EMPTY_REACTION_STATS;
    return {
      id: c.id,
      body: c.body,
      parent_id: c.parent_id,
      created_at: c.created_at,
      author: authorsMap.get(c.author_id) ?? FALLBACK_AUTHOR,
      reaction_count: stats.total,
      reactions: stats.counts,
      viewer_reaction: stats.viewerReaction,
    };
  });

  return { thread, comments };
}
