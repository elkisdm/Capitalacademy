/**
 * Árbol de comentarios de lección (raíz + 1 nivel de respuestas).
 *
 * Los comentarios borrados son soft delete: la fila sigue ahí para no romper
 * los hilos, pero no se pinta (una respuesta borrada desaparece; una raíz
 * borrada solo sobrevive si sostiene respuestas vivas). Por eso el conteo que
 * ve el usuario se calcula acá sobre lo visible y no sobre las filas crudas:
 * contar las borradas dejaba el encabezado en "1 comentario" sobre una lista
 * vacía. Mismo criterio que el "conteo visible" del foro (lib/conversaciones).
 */

export type SortOrder = "newest" | "oldest";

export type CommentNode = {
  id: string;
  parent_id: string | null;
  created_at: string;
  deleted?: boolean;
};

export function buildCommentTree<T extends CommentNode>(
  comments: T[],
  sortOrder: SortOrder,
): { repliesMap: Map<string, T[]>; sortedRoots: T[]; totalCount: number } {
  const repliesMap = new Map<string, T[]>();
  for (const c of comments) {
    if (c.parent_id && !c.deleted) {
      const existing = repliesMap.get(c.parent_id) ?? [];
      existing.push(c);
      repliesMap.set(c.parent_id, existing);
    }
  }

  const roots = comments.filter(
    (c) => !c.parent_id && (!c.deleted || (repliesMap.get(c.id)?.length ?? 0) > 0),
  );

  const sortedRoots = [...roots].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
  });

  const totalCount = comments.filter((c) => !c.deleted).length;

  return { repliesMap, sortedRoots, totalCount };
}
