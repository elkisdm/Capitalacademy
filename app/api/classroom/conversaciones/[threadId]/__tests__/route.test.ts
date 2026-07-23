import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const THREAD_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";
const PROGRAM_ID = "d1b2c3d4-e5f6-7890-abcd-ef1234567890";
const AUTHOR = { id: "a1111111-1111-1111-1111-111111111111" };
const OTHER_USER = { id: "b2222222-2222-2222-2222-222222222222" };

function makeCtx(threadId = THREAD_ID) {
  return { params: Promise.resolve({ threadId }) };
}

function makeGetRequest(qs = "") {
  return new Request(`http://localhost/api/classroom/conversaciones/${THREAD_ID}${qs}`);
}

function makePatchRequest(body?: unknown) {
  const init: RequestInit = { method: "PATCH" };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost/api/classroom/conversaciones/${THREAD_ID}`, init);
}

function makeRawPatchRequest(rawBody: string) {
  return new Request(`http://localhost/api/classroom/conversaciones/${THREAD_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

function makeDeleteRequest() {
  return new Request(`http://localhost/api/classroom/conversaciones/${THREAD_ID}`, {
    method: "DELETE",
  });
}

// ── Mutable mock state (cliente de usuario: supabase/server) ────────
// El endpoint usa `conversation_threads` para 3 operaciones distintas
// (lookup previo en PATCH, update en PATCH, delete en DELETE) — se
// diferencian por el rastro de llamadas de cada cadena (`calls`).

const mockState = {
  user: AUTHOR as { id: string } | null,
  lookupResult: { data: null as unknown, error: null as unknown },
  updateResult: { data: null as unknown, error: null as unknown },
  deleteResult: { data: [] as unknown, error: null as unknown },
  capturedUpdates: [] as unknown[],
};

function resolveConversationThreads(calls: Array<{ prop: string; args: unknown[] }>) {
  const hasUpdate = calls.some((c) => c.prop === "update");
  const hasDelete = calls.some((c) => c.prop === "delete");
  if (hasUpdate) return mockState.updateResult;
  if (hasDelete) return mockState.deleteResult;
  return mockState.lookupResult;
}

function createQueryBuilder(table: string) {
  const calls: Array<{ prop: string; args: unknown[] }> = [];
  const make = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) =>
              resolve(table === "conversation_threads" ? resolveConversationThreads(calls) : { data: null, error: null });
          }
          if (prop === "single" || prop === "maybeSingle") {
            return () =>
              Promise.resolve(
                table === "conversation_threads" ? resolveConversationThreads(calls) : { data: null, error: null },
              );
          }
          if (prop === "update") {
            return (...args: unknown[]) => {
              calls.push({ prop, args });
              mockState.capturedUpdates.push(args[0]);
              return make();
            };
          }
          if (["select", "eq", "delete", "order", "limit"].includes(prop)) {
            return (...args: unknown[]) => {
              calls.push({ prop, args });
              return make();
            };
          }
          return undefined;
        },
      },
    );
  return make();
}

// ── Module mocks (hoisted por vitest) ─────────────────────────

const mockGetThreadWithComments = vi.fn();
const mockIsProgramStaff = vi.fn();
const mockGetPublicAuthorsMap = vi.fn(async (ids: Array<string | null | undefined>) => {
  const map = new Map();
  for (const id of ids) {
    if (id) map.set(id, { id, full_name: "Autor Resuelto", avatar_url: null });
  }
  return map;
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockState.user } }),
    },
    from: (table: string) => createQueryBuilder(table),
  })),
}));

vi.mock("@/lib/conversaciones/queries", () => ({
  getThreadWithComments: (...args: unknown[]) => mockGetThreadWithComments(...args),
}));

vi.mock("@/lib/conversaciones/access", () => ({
  isProgramStaff: (...args: unknown[]) => mockIsProgramStaff(...args),
}));

vi.mock("@/lib/profiles/public-authors", () => ({
  getPublicAuthorsMap: (...args: [Array<string | null | undefined>]) =>
    mockGetPublicAuthorsMap(...args),
}));

// ── Import handlers (DESPUÉS de los mocks) ────────────────────

const { GET, PATCH, DELETE } = await import("@/app/api/classroom/conversaciones/[threadId]/route");

// ── Reset de estado antes de cada test ─────────────────────────

function setValidThread(overrides: Partial<Record<string, unknown>> = {}) {
  mockState.lookupResult = {
    data: { id: THREAD_ID, author_id: AUTHOR.id, program_id: PROGRAM_ID, ...overrides },
    error: null,
  };
}

beforeEach(() => {
  mockState.user = AUTHOR;
  mockState.lookupResult = { data: null, error: null };
  mockState.updateResult = { data: null, error: null };
  mockState.deleteResult = { data: [], error: null };
  mockState.capturedUpdates = [];

  mockGetThreadWithComments.mockReset();
  mockGetThreadWithComments.mockResolvedValue({
    thread: { id: THREAD_ID },
    comments: [],
    hasMoreComments: false,
  });

  mockIsProgramStaff.mockReset();
  mockIsProgramStaff.mockResolvedValue(false);

  mockGetPublicAuthorsMap.mockClear();

  setValidThread();
});

// ── GET ──────────────────────────────────────────────────────

describe("GET /api/classroom/conversaciones/[threadId]", () => {
  it("responde 401 si no hay usuario autenticado", async () => {
    mockState.user = null;
    const res = await GET(makeGetRequest(), makeCtx());
    expect(res.status).toBe(401);
  });

  it("responde 422 si el parámetro before no es una fecha válida", async () => {
    const res = await GET(makeGetRequest("?before=no-es-fecha"), makeCtx());
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("before inválido");
    expect(mockGetThreadWithComments).not.toHaveBeenCalled();
  });

  it("responde 404 si getThreadWithComments no encuentra la conversación", async () => {
    mockGetThreadWithComments.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest(), makeCtx());
    expect(res.status).toBe(404);
  });

  it("responde 200 y delega en getThreadWithComments sin cursor cuando no hay 'before'", async () => {
    const res = await GET(makeGetRequest(), makeCtx());
    expect(res.status).toBe(200);
    expect(mockGetThreadWithComments).toHaveBeenCalledWith(THREAD_ID, AUTHOR.id, {
      commentsBefore: undefined,
    });
  });

  it("responde 200 y pasa 'before' como cursor de comentarios cuando es una fecha válida", async () => {
    const before = "2026-01-01T00:00:00.000Z";
    const res = await GET(makeGetRequest(`?before=${encodeURIComponent(before)}`), makeCtx());
    expect(res.status).toBe(200);
    expect(mockGetThreadWithComments).toHaveBeenCalledWith(THREAD_ID, AUTHOR.id, {
      commentsBefore: before,
    });
  });

  it("devuelve el payload de getThreadWithComments tal cual", async () => {
    const payload = { thread: { id: THREAD_ID, title: "Hola" }, comments: [], hasMoreComments: true };
    mockGetThreadWithComments.mockResolvedValueOnce(payload);
    const res = await GET(makeGetRequest(), makeCtx());
    const json = await res.json();
    expect(json).toEqual(payload);
  });
});

// ── PATCH ────────────────────────────────────────────────────

describe("PATCH /api/classroom/conversaciones/[threadId]", () => {
  it("responde 401 si no hay usuario autenticado", async () => {
    mockState.user = null;
    const res = await PATCH(makePatchRequest({ title: "Nuevo" }), makeCtx());
    expect(res.status).toBe(401);
  });

  it("responde 400 si el body no es JSON válido", async () => {
    const res = await PATCH(makeRawPatchRequest("{esto no es json"), makeCtx());
    expect(res.status).toBe(400);
  });

  it("responde 422 si no se envía ningún campo", async () => {
    const res = await PATCH(makePatchRequest({}), makeCtx());
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.issues).toBeDefined();
  });

  it("responde 422 si un campo enviado no cumple la validación (title vacío)", async () => {
    const res = await PATCH(makePatchRequest({ title: "" }), makeCtx());
    expect(res.status).toBe(422);
  });

  it("responde 404 si la consulta del hilo devuelve error", async () => {
    mockState.lookupResult = { data: null, error: { message: "db down" } };
    const res = await PATCH(makePatchRequest({ title: "Nuevo" }), makeCtx());
    expect(res.status).toBe(404);
  });

  it("responde 404 si el hilo no existe (data null, sin error)", async () => {
    mockState.lookupResult = { data: null, error: null };
    const res = await PATCH(makePatchRequest({ title: "Nuevo" }), makeCtx());
    expect(res.status).toBe(404);
  });

  it("responde 403 si se piden campos de moderación y el usuario no es staff", async () => {
    mockIsProgramStaff.mockResolvedValueOnce(false);
    const res = await PATCH(makePatchRequest({ is_pinned: true }), makeCtx());
    expect(res.status).toBe(403);
    expect(mockIsProgramStaff).toHaveBeenCalledWith(expect.anything(), AUTHOR.id, PROGRAM_ID);
  });

  it("responde 403 si se edita contenido y el usuario no es el autor del hilo", async () => {
    mockState.user = OTHER_USER;
    const res = await PATCH(makePatchRequest({ title: "Nuevo" }), makeCtx());
    expect(res.status).toBe(403);
  });

  it("responde 403 si se edita contenido y modera a la vez pero no es el autor (staff no exime la regla de autoría)", async () => {
    mockState.user = OTHER_USER;
    mockIsProgramStaff.mockResolvedValueOnce(true);
    const res = await PATCH(
      makePatchRequest({ title: "Nuevo", is_pinned: true }),
      makeCtx(),
    );
    expect(res.status).toBe(403);
  });

  it("permite a un staff no-autor fijar/cerrar el hilo (solo moderación)", async () => {
    mockState.user = OTHER_USER;
    mockIsProgramStaff.mockResolvedValueOnce(true);
    mockState.updateResult = {
      data: {
        id: THREAD_ID,
        title: "T",
        body: "B",
        category: "general",
        is_pinned: true,
        is_locked: false,
        comment_count: 0,
        last_activity_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        edited_at: null,
        author_id: AUTHOR.id,
      },
      error: null,
    };
    const res = await PATCH(makePatchRequest({ is_pinned: true }), makeCtx());
    expect(res.status).toBe(200);
    // Solo moderación: no se debe fijar edited_at.
    expect(mockState.capturedUpdates[0]).toEqual({ is_pinned: true });
  });

  it("permite al autor editar title/body sin ser staff, y fija edited_at", async () => {
    mockState.updateResult = {
      data: {
        id: THREAD_ID,
        title: "Nuevo título",
        body: "Nuevo cuerpo",
        category: "general",
        is_pinned: false,
        is_locked: false,
        comment_count: 0,
        last_activity_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        edited_at: "2026-01-02T00:00:00.000Z",
        author_id: AUTHOR.id,
      },
      error: null,
    };
    const res = await PATCH(
      makePatchRequest({ title: "Nuevo título", body: "Nuevo cuerpo" }),
      makeCtx(),
    );
    expect(res.status).toBe(200);
    const payload = mockState.capturedUpdates[0] as Record<string, unknown>;
    expect(payload.title).toBe("Nuevo título");
    expect(payload.body).toBe("Nuevo cuerpo");
    expect(typeof payload.edited_at).toBe("string");
    // No se pidió moderación -> isProgramStaff nunca se invoca.
    expect(mockIsProgramStaff).not.toHaveBeenCalled();
  });

  it("combina edición de contenido y moderación cuando el autor también es staff", async () => {
    mockIsProgramStaff.mockResolvedValueOnce(true);
    mockState.updateResult = {
      data: {
        id: THREAD_ID,
        title: "T",
        body: "B",
        category: "general",
        is_pinned: true,
        is_locked: true,
        comment_count: 0,
        last_activity_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        edited_at: "2026-01-02T00:00:00.000Z",
        author_id: AUTHOR.id,
      },
      error: null,
    };
    const res = await PATCH(
      makePatchRequest({ title: "T", is_pinned: true, is_locked: true }),
      makeCtx(),
    );
    expect(res.status).toBe(200);
    const payload = mockState.capturedUpdates[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ title: "T", is_pinned: true, is_locked: true });
    expect(payload.edited_at).toBeDefined();
  });

  it("responde 500 si la actualización falla en base de datos", async () => {
    mockState.updateResult = { data: null, error: { message: "update failed" } };
    const res = await PATCH(makePatchRequest({ title: "Nuevo" }), makeCtx());
    expect(res.status).toBe(500);
  });

  it("resuelve el autor vía getPublicAuthorsMap en la respuesta", async () => {
    mockState.updateResult = {
      data: {
        id: THREAD_ID,
        title: "T",
        body: "B",
        category: "general",
        is_pinned: false,
        is_locked: false,
        comment_count: 0,
        last_activity_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        edited_at: "2026-01-02T00:00:00.000Z",
        author_id: AUTHOR.id,
      },
      error: null,
    };
    const res = await PATCH(makePatchRequest({ title: "T" }), makeCtx());
    const json = await res.json();
    expect(json.thread.author).toEqual({
      id: AUTHOR.id,
      full_name: "Autor Resuelto",
      avatar_url: null,
    });
  });

  it("usa el autor de respaldo cuando getPublicAuthorsMap no resuelve el perfil", async () => {
    mockGetPublicAuthorsMap.mockResolvedValueOnce(new Map());
    mockState.updateResult = {
      data: {
        id: THREAD_ID,
        title: "T",
        body: "B",
        category: "general",
        is_pinned: false,
        is_locked: false,
        comment_count: 0,
        last_activity_at: "2026-01-01T00:00:00.000Z",
        created_at: "2026-01-01T00:00:00.000Z",
        edited_at: "2026-01-02T00:00:00.000Z",
        author_id: AUTHOR.id,
      },
      error: null,
    };
    const res = await PATCH(makePatchRequest({ title: "T" }), makeCtx());
    const json = await res.json();
    expect(json.thread.author).toEqual({ id: AUTHOR.id, full_name: "Usuario", avatar_url: null });
  });
});

// ── DELETE ───────────────────────────────────────────────────

describe("DELETE /api/classroom/conversaciones/[threadId]", () => {
  it("responde 401 si no hay usuario autenticado", async () => {
    mockState.user = null;
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    expect(res.status).toBe(401);
  });

  it("responde 403 cuando la RLS deniega con código 42501", async () => {
    mockState.deleteResult = { data: null, error: { code: "42501", message: "denied" } };
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    expect(res.status).toBe(403);
  });

  it("responde 403 cuando la RLS deniega con código PGRST301", async () => {
    mockState.deleteResult = { data: null, error: { code: "PGRST301", message: "denied" } };
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    expect(res.status).toBe(403);
  });

  it("responde 500 ante un error genérico de base de datos", async () => {
    mockState.deleteResult = { data: null, error: { code: "XXYYZ", message: "boom" } };
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    expect(res.status).toBe(500);
  });

  it("responde 404 cuando la RLS filtra en silencio (0 filas, sin error)", async () => {
    mockState.deleteResult = { data: [], error: null };
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    expect(res.status).toBe(404);
  });

  it("responde 404 cuando data es null sin error", async () => {
    mockState.deleteResult = { data: null, error: null };
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    expect(res.status).toBe(404);
  });

  it("elimina la conversación y responde 200 con ok:true", async () => {
    mockState.deleteResult = { data: [{ id: THREAD_ID }], error: null };
    const res = await DELETE(makeDeleteRequest(), makeCtx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });
});
