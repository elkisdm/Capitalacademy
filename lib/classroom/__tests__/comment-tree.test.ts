import { describe, it, expect } from "vitest";
import { buildCommentTree } from "../comment-tree";

const c = (
  id: string,
  created_at: string,
  extra: { parent_id?: string | null; deleted?: boolean } = {},
) => ({ id, created_at, parent_id: extra.parent_id ?? null, deleted: extra.deleted });

describe("buildCommentTree", () => {
  it("ordena las raíces por fecha según el criterio elegido", () => {
    const comments = [c("a", "2026-08-13T10:00:00Z"), c("b", "2026-08-13T12:00:00Z")];

    expect(buildCommentTree(comments, "newest").sortedRoots.map((r) => r.id)).toEqual(["b", "a"]);
    expect(buildCommentTree(comments, "oldest").sortedRoots.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("agrupa las respuestas bajo su raíz", () => {
    const { repliesMap, sortedRoots, totalCount } = buildCommentTree(
      [
        c("root", "2026-08-13T10:00:00Z"),
        c("r1", "2026-08-13T11:00:00Z", { parent_id: "root" }),
        c("r2", "2026-08-13T12:00:00Z", { parent_id: "root" }),
      ],
      "newest",
    );

    expect(sortedRoots.map((r) => r.id)).toEqual(["root"]);
    expect(repliesMap.get("root")?.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(totalCount).toBe(3);
  });

  // Regresión: una lección cuyo único comentario estaba borrado mostraba
  // "1 comentario" con la lista vacía y sin estado vacío (reporte 13-ago).
  it("no cuenta ni lista un comentario borrado sin respuestas", () => {
    const { sortedRoots, totalCount } = buildCommentTree(
      [c("solo", "2026-08-13T10:00:00Z", { deleted: true })],
      "newest",
    );

    expect(sortedRoots).toEqual([]);
    expect(totalCount).toBe(0);
  });

  it("conserva la raíz borrada que sostiene respuestas vivas, sin contarla", () => {
    const { sortedRoots, repliesMap, totalCount } = buildCommentTree(
      [
        c("root", "2026-08-13T10:00:00Z", { deleted: true }),
        c("viva", "2026-08-13T11:00:00Z", { parent_id: "root" }),
      ],
      "newest",
    );

    expect(sortedRoots.map((r) => r.id)).toEqual(["root"]);
    expect(repliesMap.get("root")?.map((r) => r.id)).toEqual(["viva"]);
    expect(totalCount).toBe(1);
  });

  it("descarta las respuestas borradas del hilo y del conteo", () => {
    const { sortedRoots, repliesMap, totalCount } = buildCommentTree(
      [
        c("root", "2026-08-13T10:00:00Z"),
        c("borrada", "2026-08-13T11:00:00Z", { parent_id: "root", deleted: true }),
      ],
      "newest",
    );

    expect(sortedRoots.map((r) => r.id)).toEqual(["root"]);
    expect(repliesMap.get("root")).toBeUndefined();
    expect(totalCount).toBe(1);
  });
});
