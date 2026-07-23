import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock del borde externo: cliente de Supabase (`@/lib/supabase/server`).
//
// El módulo bajo prueba arma cadenas distintas de `.select().eq().or()...`
// según la tabla y la operación, así que el mock captura cada método llamado
// (`calls`) y delega en un `handler` registrado por tabla en cada test. Eso
// permite distinguir, p.ej., las 3 formas de query distintas que hace sobre
// `conversation_comments` (conteo visible / raíz / respuestas) sin acoplarse
// al orden de resolución de las promesas paralelas (`Promise.all`).
// ---------------------------------------------------------------------------

type Resolution = { data: unknown; error?: { message: string } | null };
type Handler = (calls: Array<[string, unknown[]]>) => Resolution;

let handlers: Record<string, Handler> = {};
let recordedCalls: Record<string, Array<Array<[string, unknown[]]>>> = {};

const CHAIN_METHODS = ["select", "eq", "or", "order", "limit", "in", "is", "lt"] as const;

function makeBuilder(table: string) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const m of CHAIN_METHODS) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return builder;
    };
  }
  const resolve = (): Resolution => {
    recordedCalls[table] = recordedCalls[table] ?? [];
    recordedCalls[table].push(calls);
    const h = handlers[table];
    if (!h) throw new Error(`Test: sin handler configurado para tabla "${table}"`);
    return h(calls);
  };
  builder.maybeSingle = () => Promise.resolve(resolve());
  builder.then = (onFulfilled: (r: Resolution) => unknown, onRejected: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled, onRejected);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => makeBuilder(table),
  })),
}));

const mockGetPublicAuthorsMap = vi.fn();
vi.mock("@/lib/profiles/public-authors", () => ({
  getPublicAuthorsMap: (...args: unknown[]) => mockGetPublicAuthorsMap(...args),
}));

const mockGetProgramStaffIds = vi.fn();
vi.mock("@/lib/profiles/program-staff", () => ({
  getProgramStaffIds: (...args: unknown[]) => mockGetProgramStaffIds(...args),
}));

const { getProgramThreads, getThreadWithComments } = await import(
  "@/lib/conversaciones/queries"
);

beforeEach(() => {
  handlers = {};
  recordedCalls = {};
  mockGetPublicAuthorsMap.mockReset().mockResolvedValue(new Map());
  mockGetProgramStaffIds.mockReset().mockResolvedValue(new Set());
});

function lastCallsFor(table: string): Array<[string, unknown[]]> {
  const all = recordedCalls[table] ?? [];
  return all[all.length - 1] ?? [];
}

function findCall(calls: Array<[string, unknown[]]>, method: string) {
  return calls.find((c) => c[0] === method);
}

// ---------------------------------------------------------------------------
// getProgramThreads
// ---------------------------------------------------------------------------

describe("getProgramThreads", () => {
  it("camino feliz (sort 'recent' por defecto): arma el feed, usa conteo visible (no el denormalizado), y calcula is_staff/bookmark/reacciones por hilo", async () => {
    handlers["conversation_threads"] = () => ({
      data: [
        {
          id: "t1",
          title: "Hilo 1",
          body: "Cuerpo 1",
          category: "general",
          is_pinned: true,
          is_locked: false,
          comment_count: 99, // denormalizado y desactualizado a propósito
          last_activity_at: "2026-07-20T10:00:00Z",
          created_at: "2026-07-19T10:00:00Z",
          author_id: "u1",
        },
        {
          id: "t2",
          title: "Hilo 2",
          body: "Cuerpo 2",
          category: "general",
          is_pinned: false,
          is_locked: false,
          comment_count: 0,
          last_activity_at: "2026-07-18T10:00:00Z",
          created_at: "2026-07-17T10:00:00Z",
          author_id: "u2",
        },
      ],
      error: null,
    });

    handlers["conversation_reactions"] = (calls) => {
      const inCall = findCall(calls, "in")!;
      const column = inCall[1][0];
      if (column === "thread_id") {
        return {
          data: [
            { thread_id: "t1", comment_id: null, user_id: "viewer", emoji: "❤️" },
            { thread_id: "t1", comment_id: null, user_id: "u3", emoji: "❤️" },
            { thread_id: "t1", comment_id: null, user_id: "u4", emoji: "👍" },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    };

    handlers["conversation_bookmarks"] = () => ({ data: [{ thread_id: "t2" }], error: null });

    handlers["conversation_comments"] = () => ({
      data: [
        { thread_id: "t1" },
        { thread_id: "t1" },
        { thread_id: "t1" },
        { thread_id: "t1" },
        { thread_id: "t1" },
      ],
      error: null,
    });

    mockGetPublicAuthorsMap.mockResolvedValue(
      new Map([["u1", { id: "u1", full_name: "Ana", avatar_url: null, is_staff: false }]]),
    );
    mockGetProgramStaffIds.mockResolvedValue(new Set(["u1"]));

    const result = await getProgramThreads("p1", "viewer");

    expect(result).toHaveLength(2);

    // t1: conteo visible (5) reemplaza al denormalizado (99).
    expect(result[0]).toMatchObject({
      id: "t1",
      comment_count: 5,
      reaction_count: 3,
      viewer_reaction: "❤️",
      viewer_bookmarked: false,
    });
    expect(result[0].reactions).toEqual([
      { emoji: "❤️", count: 2 },
      { emoji: "👍", count: 1 },
    ]);
    // is_staff true por staffIds aunque el perfil público diga false.
    expect(result[0].author).toEqual({ id: "u1", full_name: "Ana", avatar_url: null, is_staff: true });

    // t2: autor no resuelto -> fallback; sin reacciones; con bookmark.
    expect(result[1]).toMatchObject({
      id: "t2",
      comment_count: 0,
      reaction_count: 0,
      viewer_reaction: null,
      viewer_bookmarked: true,
    });
    expect(result[1].reactions).toEqual([]);
    expect(result[1].author).toEqual({ id: "", full_name: "Usuario", avatar_url: null, is_staff: false });

    // Orden 'recent': keyset (is_pinned desc, last_activity_at desc, id desc), sin `.or()` de cursor ni de búsqueda.
    const calls = lastCallsFor("conversation_threads");
    expect(findCall(calls, "or")).toBeUndefined();
    expect(findCall(calls, "limit")).toEqual(["limit", [50]]);
    const orderCalls = calls.filter((c) => c[0] === "order");
    expect(orderCalls).toHaveLength(3);
  });

  it("propaga el error de la BD en vez de tragárselo (hallazgo 19)", async () => {
    handlers["conversation_threads"] = () => ({ data: null, error: { message: "boom" } });

    await expect(getProgramThreads("p1", "viewer")).rejects.toThrow("getProgramThreads: boom");
  });

  it("devuelve [] cuando la query no lanza error pero data es null", async () => {
    handlers["conversation_threads"] = () => ({ data: null, error: null });

    const result = await getProgramThreads("p1", "viewer");
    expect(result).toEqual([]);
  });

  it("con data=[] no consulta reacciones/bookmarks/comentarios (ids.length===0 corta antes) y devuelve []", async () => {
    handlers["conversation_threads"] = () => ({ data: [], error: null });
    // A propósito NO se registran handlers para conversation_reactions/bookmarks/comments:
    // si el código las llamara igual, el mock lanza "sin handler configurado" y el test falla.

    const result = await getProgramThreads("p1", "viewer");

    expect(result).toEqual([]);
    expect(mockGetPublicAuthorsMap).toHaveBeenCalledWith([]);
    expect(mockGetProgramStaffIds).toHaveBeenCalledWith("p1");
  });

  it("con cursor (isPinned true) arma el filtro keyset exacto vía buildRecentCursorFilter", async () => {
    handlers["conversation_threads"] = () => ({ data: [], error: null });

    await getProgramThreads("p1", "viewer", {
      cursor: { isPinned: true, lastActivityAt: "2026-07-20T10:00:00Z", id: "t5" },
    });

    const calls = lastCallsFor("conversation_threads");
    const orCall = findCall(calls, "or")!;
    expect(orCall[1][0]).toBe(
      'is_pinned.lt.true,and(is_pinned.eq.true,last_activity_at.lt."2026-07-20T10:00:00Z"),and(is_pinned.eq.true,last_activity_at.eq."2026-07-20T10:00:00Z",id.lt.t5)',
    );
  });

  it("con cursor (isPinned false) arma el filtro keyset con el literal 'false'", async () => {
    handlers["conversation_threads"] = () => ({ data: [], error: null });

    await getProgramThreads("p1", "viewer", {
      cursor: { isPinned: false, lastActivityAt: "2026-07-18T09:00:00Z", id: "t9" },
    });

    const calls = lastCallsFor("conversation_threads");
    const orCall = findCall(calls, "or")!;
    expect(orCall[1][0]).toBe(
      'is_pinned.lt.false,and(is_pinned.eq.false,last_activity_at.lt."2026-07-18T09:00:00Z"),and(is_pinned.eq.false,last_activity_at.eq."2026-07-18T09:00:00Z",id.lt.t9)',
    );
  });

  it("con `q` usa el set acotado (ilike) y escapa comillas en el término de búsqueda", async () => {
    handlers["conversation_threads"] = () => ({ data: [], error: null });

    await getProgramThreads("p1", "viewer", { q: 'ta"co' });

    const calls = lastCallsFor("conversation_threads");
    const orCall = findCall(calls, "or")!;
    expect(orCall[1][0]).toBe('title.ilike."%ta\\"co%",body.ilike."%ta\\"co%"');
    // Set acotado: un solo `order` (last_activity_at) + limit(BOUNDED_SET_CAP), no el keyset de 3 columnas.
    const orderCalls = calls.filter((c) => c[0] === "order");
    expect(orderCalls).toHaveLength(1);
    expect(findCall(calls, "limit")).toEqual(["limit", [200]]);
  });

  it("sort 'top' reordena en JS por reaction_count desc", async () => {
    handlers["conversation_threads"] = () => ({
      data: [
        {
          id: "t1",
          title: "A",
          body: "a",
          category: "general",
          is_pinned: false,
          is_locked: false,
          comment_count: 0,
          last_activity_at: "2026-07-20T10:00:00Z",
          created_at: "2026-07-19T10:00:00Z",
          author_id: "u1",
        },
        {
          id: "t2",
          title: "B",
          body: "b",
          category: "general",
          is_pinned: false,
          is_locked: false,
          comment_count: 0,
          last_activity_at: "2026-07-18T10:00:00Z",
          created_at: "2026-07-17T10:00:00Z",
          author_id: "u2",
        },
      ],
      error: null,
    });
    handlers["conversation_reactions"] = (calls) => {
      const inCall = findCall(calls, "in")!;
      if (inCall[1][0] !== "thread_id") return { data: [], error: null };
      return {
        data: [
          { thread_id: "t1", comment_id: null, user_id: "u3", emoji: "❤️" },
          { thread_id: "t2", comment_id: null, user_id: "u3", emoji: "❤️" },
          { thread_id: "t2", comment_id: null, user_id: "u4", emoji: "👍" },
          { thread_id: "t2", comment_id: null, user_id: "u5", emoji: "🎉" },
        ],
        error: null,
      };
    };
    handlers["conversation_bookmarks"] = () => ({ data: [], error: null });
    handlers["conversation_comments"] = () => ({ data: [], error: null });

    const result = await getProgramThreads("p1", "viewer", { sort: "top" });

    // t2 (3 reacciones) queda antes que t1 (1), aunque la BD lo devolvió al revés.
    expect(result.map((r) => r.id)).toEqual(["t2", "t1"]);
  });

  it("sort 'unanswered' filtra comment_count===0 y ordena por last_activity_at desc", async () => {
    handlers["conversation_threads"] = () => ({
      data: [
        {
          id: "t1",
          title: "Sin respuesta, más vieja",
          body: "a",
          category: "general",
          is_pinned: false,
          is_locked: false,
          comment_count: 0,
          last_activity_at: "2026-07-15T10:00:00Z",
          created_at: "2026-07-15T10:00:00Z",
          author_id: "u1",
        },
        {
          id: "t2",
          title: "Con respuestas",
          body: "b",
          category: "general",
          is_pinned: false,
          is_locked: false,
          comment_count: 0, // denormalizado dice 0
          last_activity_at: "2026-07-20T10:00:00Z",
          created_at: "2026-07-20T10:00:00Z",
          author_id: "u2",
        },
        {
          id: "t3",
          title: "Sin respuesta, más nueva",
          body: "c",
          category: "general",
          is_pinned: false,
          is_locked: false,
          comment_count: 0,
          last_activity_at: "2026-07-19T10:00:00Z",
          created_at: "2026-07-19T10:00:00Z",
          author_id: "u3",
        },
      ],
      error: null,
    });
    handlers["conversation_reactions"] = () => ({ data: [], error: null });
    handlers["conversation_bookmarks"] = () => ({ data: [], error: null });
    handlers["conversation_comments"] = () => ({
      // t2 tiene 2 comentarios visibles reales (contradice su denormalizado en 0) -> queda excluido de "sin responder".
      data: [{ thread_id: "t2" }, { thread_id: "t2" }],
      error: null,
    });

    const result = await getProgramThreads("p1", "viewer", { sort: "unanswered" });

    expect(result.map((r) => r.id)).toEqual(["t3", "t1"]);
  });
});

// ---------------------------------------------------------------------------
// getThreadWithComments
// ---------------------------------------------------------------------------

function commentsHandler(opts: {
  visibleCountRows: Array<{ thread_id: string }>;
  rootDesc: Array<Record<string, unknown>>;
  replyRows: Array<Record<string, unknown>>;
}): Handler {
  return (calls) => {
    const isCall = findCall(calls, "is");
    if (isCall) {
      if (isCall[1][0] === "deleted_at") return { data: opts.visibleCountRows, error: null };
      if (isCall[1][0] === "parent_id") return { data: opts.rootDesc, error: null };
    }
    const inCall = findCall(calls, "in");
    if (inCall && inCall[1][0] === "parent_id") return { data: opts.replyRows, error: null };
    throw new Error("Test: forma de query no reconocida en conversation_comments");
  };
}

describe("getThreadWithComments", () => {
  it("devuelve null si la query del hilo da error", async () => {
    handlers["conversation_threads"] = () => ({ data: null, error: { message: "db down" } });

    const result = await getThreadWithComments("t404", "viewer");
    expect(result).toBeNull();
  });

  it("devuelve null si el hilo no existe (o RLS lo oculta): data null sin error", async () => {
    handlers["conversation_threads"] = () => ({ data: null, error: null });

    const result = await getThreadWithComments("t404", "viewer");
    expect(result).toBeNull();
  });

  it("camino feliz: pagina comentarios raíz, arrastra respuestas, marca borrados, resuelve reacciones/staff/bookmark y usa el conteo visible", async () => {
    handlers["conversation_threads"] = () => ({
      data: {
        id: "t1",
        title: "Hilo 1",
        body: "Cuerpo",
        category: "general",
        is_pinned: false,
        is_locked: false,
        comment_count: 99, // denormalizado, no debe usarse
        last_activity_at: "2026-07-20T12:30:00Z",
        created_at: "2026-07-19T10:00:00Z",
        author_id: "u1",
        program_id: "p1",
        edited_at: null,
      },
      error: null,
    });

    // 3 raíces desc (como las devolvería la query), limit=2 -> hay más.
    const rootDesc = [
      {
        id: "c3",
        body: "Comentario visible",
        parent_id: null,
        created_at: "2026-07-20T12:00:00Z",
        edited_at: "2026-07-20T12:10:00Z",
        deleted_at: null,
        author_id: "u3",
      },
      {
        id: "c2",
        body: "Comentario borrado",
        parent_id: null,
        created_at: "2026-07-20T11:00:00Z",
        edited_at: null,
        deleted_at: "2026-07-20T11:05:00Z",
        author_id: "u2",
      },
      {
        id: "c1",
        body: "Fuera de página",
        parent_id: null,
        created_at: "2026-07-20T10:00:00Z",
        edited_at: null,
        deleted_at: null,
        author_id: "u1",
      },
    ];
    const replyRows = [
      {
        id: "r1",
        body: "Respuesta",
        parent_id: "c3",
        created_at: "2026-07-20T12:30:00Z",
        edited_at: null,
        deleted_at: null,
        author_id: "u4",
      },
    ];
    handlers["conversation_comments"] = commentsHandler({
      visibleCountRows: [
        { thread_id: "t1" },
        { thread_id: "t1" },
        { thread_id: "t1" },
        { thread_id: "t1" },
        { thread_id: "t1" },
        { thread_id: "t1" },
        { thread_id: "t1" },
      ], // 7 visibles, distinto del denormalizado (99)
      rootDesc,
      replyRows,
    });

    handlers["conversation_reactions"] = (calls) => {
      const inCall = findCall(calls, "in")!;
      const column = inCall[1][0] as string;
      if (column === "thread_id") {
        return { data: [{ thread_id: "t1", comment_id: null, user_id: "viewer", emoji: "🎉" }], error: null };
      }
      // column === "comment_id": incluye una fila con comment_id null para
      // cubrir la rama `if (!targetId) continue;`.
      return {
        data: [
          { thread_id: null, comment_id: "c3", user_id: "u9", emoji: "👍" },
          { thread_id: null, comment_id: null, user_id: "u10", emoji: "❤️" },
        ],
        error: null,
      };
    };

    handlers["conversation_bookmarks"] = () => ({ data: [{ thread_id: "t1" }], error: null });

    mockGetPublicAuthorsMap.mockResolvedValue(
      new Map([
        ["u1", { id: "u1", full_name: "Autor Hilo", avatar_url: null, is_staff: false }],
        ["u3", { id: "u3", full_name: "Autor C3", avatar_url: null, is_staff: false }],
      ]),
    );
    mockGetProgramStaffIds.mockResolvedValue(new Set(["u4"]));

    const result = await getThreadWithComments("t1", "viewer", { commentsLimit: 2 });

    expect(result).not.toBeNull();
    const { thread, comments, hasMoreComments } = result!;

    expect(hasMoreComments).toBe(true);
    expect(thread.comment_count).toBe(7); // conteo visible, no el denormalizado
    expect(thread.reaction_count).toBe(1);
    expect(thread.viewer_reaction).toBe("🎉");
    expect(thread.viewer_bookmarked).toBe(true);
    expect(thread.author).toEqual({ id: "u1", full_name: "Autor Hilo", avatar_url: null, is_staff: false });

    // Orden ascendente de la página (c2 11:00 antes que c3 12:00), luego la respuesta.
    expect(comments.map((c) => c.id)).toEqual(["c2", "c3", "r1"]);

    // c2: soft-deleted -> body vacío + deleted true, autor fallback.
    expect(comments[0]).toMatchObject({ id: "c2", body: "", deleted: true });
    expect(comments[0].author).toEqual({ id: "", full_name: "Usuario", avatar_url: null, is_staff: false });

    // c3: visible, con reacción de u9 (no del viewer) -> viewer_reaction null.
    expect(comments[1]).toMatchObject({ id: "c3", body: "Comentario visible", deleted: false, reaction_count: 1, viewer_reaction: null });
    expect(comments[1].author).toEqual({ id: "u3", full_name: "Autor C3", avatar_url: null, is_staff: false });

    // r1: respuesta con autor no resuelto por perfil público pero is_staff true por staffIds.
    expect(comments[2]).toMatchObject({ id: "r1", parent_id: "c3", deleted: false });
    expect(comments[2].author).toEqual({ id: "", full_name: "Usuario", avatar_url: null, is_staff: true });

    // La query de respuestas se filtró por los ids de la página cargada (c3, c2), no por "c1" (fuera de página).
    const commentsCallsLog = recordedCalls["conversation_comments"] ?? [];
    const replyCallEntry = commentsCallsLog.find((calls) => {
      const inCall = findCall(calls, "in");
      return inCall && inCall[1][0] === "parent_id";
    })!;
    expect(replyCallEntry).toBeDefined();
    expect((replyCallEntry.find((c) => c[0] === "in")![1][1] as string[]).sort()).toEqual(["c2", "c3"]);
  });

  it("hasMoreComments es false cuando las raíces devueltas no exceden el límite", async () => {
    handlers["conversation_threads"] = () => ({
      data: {
        id: "t1",
        title: "Hilo",
        body: "b",
        category: "general",
        is_pinned: false,
        is_locked: false,
        comment_count: 0,
        last_activity_at: "2026-07-20T10:00:00Z",
        created_at: "2026-07-19T10:00:00Z",
        author_id: "u1",
        program_id: "p1",
        edited_at: null,
      },
      error: null,
    });
    handlers["conversation_comments"] = commentsHandler({
      visibleCountRows: [{ thread_id: "t1" }],
      rootDesc: [
        {
          id: "c1",
          body: "Único",
          parent_id: null,
          created_at: "2026-07-20T10:00:00Z",
          edited_at: null,
          deleted_at: null,
          author_id: "u1",
        },
      ],
      replyRows: [],
    });
    handlers["conversation_reactions"] = () => ({ data: [], error: null });
    handlers["conversation_bookmarks"] = () => ({ data: [], error: null });

    const result = await getThreadWithComments("t1", "viewer");

    expect(result!.hasMoreComments).toBe(false);
    expect(result!.comments).toHaveLength(1);
  });

  it("sin comentarios raíz no dispara la query de respuestas (rootIds vacío) y devuelve comments=[]", async () => {
    handlers["conversation_threads"] = () => ({
      data: {
        id: "t1",
        title: "Hilo",
        body: "b",
        category: "general",
        is_pinned: false,
        is_locked: false,
        comment_count: 0,
        last_activity_at: "2026-07-20T10:00:00Z",
        created_at: "2026-07-19T10:00:00Z",
        author_id: "u1",
        program_id: "p1",
        edited_at: null,
      },
      error: null,
    });
    // No hay forma "in parent_id" registrada: si el código la llamara igual, el
    // handler compartido lanzaría "forma no reconocida" y el test fallaría.
    handlers["conversation_comments"] = commentsHandler({
      visibleCountRows: [],
      rootDesc: [],
      replyRows: [],
    });
    handlers["conversation_reactions"] = () => ({ data: [], error: null });
    handlers["conversation_bookmarks"] = () => ({ data: [], error: null });

    const result = await getThreadWithComments("t1", "viewer");

    expect(result!.comments).toEqual([]);
    expect(result!.hasMoreComments).toBe(false);
  });

  it("con commentsBefore filtra la página de raíces vía `.lt(created_at, ...)`", async () => {
    handlers["conversation_threads"] = () => ({
      data: {
        id: "t1",
        title: "Hilo",
        body: "b",
        category: "general",
        is_pinned: false,
        is_locked: false,
        comment_count: 0,
        last_activity_at: "2026-07-20T10:00:00Z",
        created_at: "2026-07-19T10:00:00Z",
        author_id: "u1",
        program_id: "p1",
        edited_at: null,
      },
      error: null,
    });
    handlers["conversation_comments"] = commentsHandler({
      visibleCountRows: [],
      rootDesc: [],
      replyRows: [],
    });
    handlers["conversation_reactions"] = () => ({ data: [], error: null });
    handlers["conversation_bookmarks"] = () => ({ data: [], error: null });

    await getThreadWithComments("t1", "viewer", { commentsBefore: "2026-07-20T11:00:00Z" });

    const commentsCallsLog = recordedCalls["conversation_comments"] ?? [];
    const rootCallEntry = commentsCallsLog.find((calls) => {
      const isCall = findCall(calls, "is");
      return isCall && isCall[1][0] === "parent_id";
    })!;
    expect(findCall(rootCallEntry, "lt")).toEqual(["lt", ["created_at", "2026-07-20T11:00:00Z"]]);
  });
});
