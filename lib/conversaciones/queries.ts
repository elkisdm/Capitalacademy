import { createClient } from "@/lib/supabase/server";
import { getPublicAuthorsMap } from "@/lib/profiles/public-authors";

export type ThreadAuthor = {
  id: string;
  full_name: string;
  avatar_url: string | null;
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
  viewer_reacted: boolean;
};

export type ConversationComment = {
  id: string;
  body: string;
  parent_id: string | null;
  created_at: string;
  author: ThreadAuthor;
  reaction_count: number;
  viewer_reacted: boolean;
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
  viewer_reacted: boolean;
};

const DEFAULT_LIST_LIMIT = 50;

const FALLBACK_AUTHOR: ThreadAuthor = {
  id: "",
  full_name: "Usuario",
  avatar_url: null,
};

type ReactionStats = { count: number; viewerReacted: boolean };

/**
 * Cuenta reacciones ❤️ por target (thread o comentario) con una sola query a
 * `conversation_reactions` y agregación en JS — evita el embedded-count de
 * PostgREST (menos robusto ante RLS y ordenamientos). `column` decide si el
 * `.in()` filtra por `thread_id` o `comment_id`; la otra columna queda null
 * en cada fila y no matchea el IN, así que no hace falta filtrarla aparte.
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
    .select("thread_id, comment_id, user_id")
    .in(column, ids);

  for (const row of (data ?? []) as Array<{
    thread_id: string | null;
    comment_id: string | null;
    user_id: string;
  }>) {
    const targetId = column === "thread_id" ? row.thread_id : row.comment_id;
    if (!targetId) continue;
    const stats = map.get(targetId) ?? { count: 0, viewerReacted: false };
    stats.count += 1;
    if (row.user_id === viewerId) stats.viewerReacted = true;
    map.set(targetId, stats);
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
  opts?: { sort?: "recent" | "top"; limit?: number },
): Promise<ThreadListItem[]> {
  const supabase = await createClient();
  const limit = opts?.limit ?? DEFAULT_LIST_LIMIT;

  const { data, error } = await supabase
    .from("conversation_threads")
    .select(THREAD_SELECT)
    .eq("program_id", programId)
    .order("is_pinned", { ascending: false })
    .order("last_activity_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const threads = data as unknown as ThreadRow[];
  const threadIds = threads.map((t) => t.id);
  const [reactionMap, authorsMap] = await Promise.all([
    getReactionStatsMap(supabase, "thread_id", threadIds, viewerId),
    getPublicAuthorsMap(threads.map((t) => t.author_id)),
  ]);

  const items: ThreadListItem[] = threads.map((t) => {
    const stats = reactionMap.get(t.id) ?? { count: 0, viewerReacted: false };
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
      reaction_count: stats.count,
      viewer_reacted: stats.viewerReacted,
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

  const [threadReactions, commentReactions, authorsMap] = await Promise.all([
    getReactionStatsMap(supabase, "thread_id", [threadId], viewerId),
    getReactionStatsMap(supabase, "comment_id", commentIds, viewerId),
    getPublicAuthorsMap([
      threadRow.author_id,
      ...commentRows.map((c) => c.author_id),
    ]),
  ]);

  const threadStats = threadReactions.get(threadId) ?? { count: 0, viewerReacted: false };

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
    reaction_count: threadStats.count,
    viewer_reacted: threadStats.viewerReacted,
  };

  const comments: ConversationComment[] = commentRows.map((c) => {
    const stats = commentReactions.get(c.id) ?? { count: 0, viewerReacted: false };
    return {
      id: c.id,
      body: c.body,
      parent_id: c.parent_id,
      created_at: c.created_at,
      author: authorsMap.get(c.author_id) ?? FALLBACK_AUTHOR,
      reaction_count: stats.count,
      viewer_reacted: stats.viewerReacted,
    };
  });

  return { thread, comments };
}
