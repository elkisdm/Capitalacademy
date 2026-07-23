import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const PROGRAM_ID = "d1b2c3d4-e5f6-7890-abcd-ef1234567890";
const THREAD_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";
const ACTOR = { id: "u1111111-1111-1111-1111-111111111111" };

function makeGetRequest(qs: string) {
  return new Request(`http://localhost/api/classroom/conversaciones${qs}`);
}

function makePostRequest(body?: unknown) {
  return new Request("http://localhost/api/classroom/conversaciones", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRawPostRequest(rawBody: string) {
  return new Request("http://localhost/api/classroom/conversaciones", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

// ── Estado mutable (cliente de usuario: supabase/server) ────────

const mockState = {
  user: ACTOR as { id: string } | null,
  insertResult: { data: null as unknown, error: null as unknown },
  lastInsertPayload: null as unknown,
};

function createQueryBuilder(_table: string) {
  const make = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "single") {
            return () => Promise.resolve(mockState.insertResult);
          }
          if (prop === "insert") {
            return (payload: unknown) => {
              mockState.lastInsertPayload = payload;
              return make();
            };
          }
          if (prop === "select") {
            return (...args: unknown[]) => make();
          }
          return undefined;
        },
      },
    );
  return make();
}

// ── Mocks de módulos (hoisted por vitest) ───────────────────────

const mockCheck = vi.fn();
const mockGetProgramThreads = vi.fn();
const mockGetPublicAuthorsMap = vi.fn(async (ids: Array<string | null | undefined>) => {
  const map = new Map();
  for (const id of ids) {
    if (id) map.set(id, { id, full_name: "Actor Test", avatar_url: null, is_staff: false });
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

vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({ check: (...args: unknown[]) => mockCheck(...args) }),
  rateLimitResponse: () =>
    Response.json(
      { error: "Demasiadas solicitudes. Intenta nuevamente más tarde." },
      { status: 429 },
    ),
}));

vi.mock("@/lib/conversaciones/queries", () => ({
  getProgramThreads: (...args: unknown[]) => mockGetProgramThreads(...args),
}));

vi.mock("@/lib/profiles/public-authors", () => ({
  getPublicAuthorsMap: (...args: [Array<string | null | undefined>]) =>
    mockGetPublicAuthorsMap(...args),
}));

// ── Import handlers (DESPUÉS de los mocks) ──────────────────────

const { GET, POST } = await import("@/app/api/classroom/conversaciones/route");

// ── Reset de estado antes de cada test ──────────────────────────

beforeEach(() => {
  mockState.user = ACTOR;
  mockState.insertResult = {
    data: {
      id: THREAD_ID,
      title: "Título",
      body: "Cuerpo",
      category: "general",
      is_pinned: false,
      is_locked: false,
      comment_count: 0,
      last_activity_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      author_id: ACTOR.id,
    },
    error: null,
  };

  mockCheck.mockReset();
  mockCheck.mockReturnValue({ ok: true, remaining: 9, resetAt: Date.now() + 60_000 });

  mockGetProgramThreads.mockReset();
  mockGetProgramThreads.mockResolvedValue([]);

  mockGetPublicAuthorsMap.mockClear();
  mockState.lastInsertPayload = null;
});

// ── GET ──────────────────────────────────────────────────────

describe("GET /api/classroom/conversaciones", () => {
  it("responde 401 si no hay usuario autenticado", async () => {
    mockState.user = null;
    const res = await GET(makeGetRequest(`?programId=${PROGRAM_ID}`));
    expect(res.status).toBe(401);
  });

  it("responde 422 si falta programId", async () => {
    const res = await GET(makeGetRequest(""));
    expect(res.status).toBe(422);
  });

  it("responde 422 si programId no es un UUID válido", async () => {
    const res = await GET(makeGetRequest("?programId=no-es-un-uuid"));
    expect(res.status).toBe(422);
  });

  it("responde 422 si sort tiene un valor inválido", async () => {
    const res = await GET(makeGetRequest(`?programId=${PROGRAM_ID}&sort=viral`));
    expect(res.status).toBe(422);
  });

  it("acepta sort ausente y llama a getProgramThreads con sort undefined", async () => {
    const res = await GET(makeGetRequest(`?programId=${PROGRAM_ID}`));
    expect(res.status).toBe(200);
    expect(mockGetProgramThreads).toHaveBeenCalledWith(
      PROGRAM_ID,
      ACTOR.id,
      expect.objectContaining({ sort: undefined, q: undefined, cursor: undefined }),
    );
  });

  it("acepta sort=top y lo pasa a getProgramThreads", async () => {
    const res = await GET(makeGetRequest(`?programId=${PROGRAM_ID}&sort=top`));
    expect(res.status).toBe(200);
    expect(mockGetProgramThreads).toHaveBeenCalledWith(
      PROGRAM_ID,
      ACTOR.id,
      expect.objectContaining({ sort: "top" }),
    );
  });

  it("recorta q y lo pasa como undefined si queda vacío tras el trim", async () => {
    const res = await GET(makeGetRequest(`?programId=${PROGRAM_ID}&q=%20%20`));
    expect(res.status).toBe(200);
    expect(mockGetProgramThreads).toHaveBeenCalledWith(
      PROGRAM_ID,
      ACTOR.id,
      expect.objectContaining({ q: undefined }),
    );
  });

  it("pasa q recortado cuando tiene contenido", async () => {
    const res = await GET(makeGetRequest(`?programId=${PROGRAM_ID}&q=%20hola%20`));
    expect(res.status).toBe(200);
    expect(mockGetProgramThreads).toHaveBeenCalledWith(
      PROGRAM_ID,
      ACTOR.id,
      expect.objectContaining({ q: "hola" }),
    );
  });

  it("responde 422 si el cursor no tiene 3 partes", async () => {
    const res = await GET(
      makeGetRequest(`?programId=${PROGRAM_ID}&cursor=true|2026-01-01T00:00:00.000Z`),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("cursor inválido");
  });

  it("responde 422 si el isPinned del cursor no es 'true' ni 'false'", async () => {
    const res = await GET(
      makeGetRequest(
        `?programId=${PROGRAM_ID}&cursor=quizas|2026-01-01T00:00:00.000Z|${THREAD_ID}`,
      ),
    );
    expect(res.status).toBe(422);
  });

  it("responde 422 si la fecha del cursor es inválida", async () => {
    const res = await GET(
      makeGetRequest(`?programId=${PROGRAM_ID}&cursor=true|fecha-invalida|${THREAD_ID}`),
    );
    expect(res.status).toBe(422);
  });

  it("responde 422 si el id del cursor no es un UUID válido", async () => {
    const res = await GET(
      makeGetRequest(
        `?programId=${PROGRAM_ID}&cursor=true|2026-01-01T00:00:00.000Z|no-es-un-uuid`,
      ),
    );
    expect(res.status).toBe(422);
  });

  it("parsea un cursor válido y lo pasa como objeto a getProgramThreads", async () => {
    const res = await GET(
      makeGetRequest(
        `?programId=${PROGRAM_ID}&cursor=false|2026-01-01T00:00:00.000Z|${THREAD_ID}`,
      ),
    );
    expect(res.status).toBe(200);
    expect(mockGetProgramThreads).toHaveBeenCalledWith(
      PROGRAM_ID,
      ACTOR.id,
      expect.objectContaining({
        cursor: { isPinned: false, lastActivityAt: "2026-01-01T00:00:00.000Z", id: THREAD_ID },
      }),
    );
  });

  it("responde 200 con los hilos devueltos por getProgramThreads", async () => {
    const threads = [{ id: THREAD_ID, title: "Hola" }];
    mockGetProgramThreads.mockResolvedValueOnce(threads);
    const res = await GET(makeGetRequest(`?programId=${PROGRAM_ID}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ threads });
  });

  it("responde 500 si getProgramThreads lanza un error", async () => {
    mockGetProgramThreads.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(makeGetRequest(`?programId=${PROGRAM_ID}`));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al cargar las conversaciones");
  });
});

// ── POST ─────────────────────────────────────────────────────

describe("POST /api/classroom/conversaciones", () => {
  it("responde 401 si no hay usuario autenticado", async () => {
    mockState.user = null;
    const res = await POST(
      makePostRequest({ programId: PROGRAM_ID, title: "Título", body: "Cuerpo" }),
    );
    expect(res.status).toBe(401);
  });

  it("responde 429 si se supera el rate limit", async () => {
    mockCheck.mockReturnValue({ ok: false, remaining: 0, resetAt: Date.now() + 1000 });
    const res = await POST(
      makePostRequest({ programId: PROGRAM_ID, title: "Título", body: "Cuerpo" }),
    );
    expect(res.status).toBe(429);
  });

  it("responde 400 si el body no es JSON válido", async () => {
    const res = await POST(makeRawPostRequest("{esto no es json"));
    expect(res.status).toBe(400);
  });

  it("responde 422 si falta programId", async () => {
    const res = await POST(makePostRequest({ title: "Título", body: "Cuerpo" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.issues).toBeDefined();
  });

  it("responde 422 si el título está vacío tras el trim", async () => {
    const res = await POST(
      makePostRequest({ programId: PROGRAM_ID, title: "   ", body: "Cuerpo" }),
    );
    expect(res.status).toBe(422);
  });

  it("responde 422 si el cuerpo está vacío", async () => {
    const res = await POST(
      makePostRequest({ programId: PROGRAM_ID, title: "Título", body: "" }),
    );
    expect(res.status).toBe(422);
  });

  it("responde 422 si el título excede 200 caracteres", async () => {
    const res = await POST(
      makePostRequest({ programId: PROGRAM_ID, title: "a".repeat(201), body: "Cuerpo" }),
    );
    expect(res.status).toBe(422);
  });

  it("responde 422 si el cuerpo excede 10000 caracteres", async () => {
    const res = await POST(
      makePostRequest({ programId: PROGRAM_ID, title: "Título", body: "a".repeat(10001) }),
    );
    expect(res.status).toBe(422);
  });

  it("responde 500 si el insert falla", async () => {
    mockState.insertResult = { data: null, error: { message: "insert failed" } };
    const res = await POST(
      makePostRequest({ programId: PROGRAM_ID, title: "Título", body: "Cuerpo" }),
    );
    expect(res.status).toBe(500);
  });

  it("crea el hilo (201) y arma la forma esperada de la respuesta", async () => {
    const res = await POST(
      makePostRequest({ programId: PROGRAM_ID, title: "Título", body: "Cuerpo" }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.thread).toEqual({
      id: THREAD_ID,
      title: "Título",
      body: "Cuerpo",
      category: "general",
      is_pinned: false,
      is_locked: false,
      comment_count: 0,
      last_activity_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      author_id: ACTOR.id,
      author: { id: ACTOR.id, full_name: "Actor Test", avatar_url: null, is_staff: false },
      reaction_count: 0,
      viewer_reacted: false,
    });
  });

  it("usa el autor de respaldo cuando getPublicAuthorsMap no resuelve el perfil", async () => {
    mockGetPublicAuthorsMap.mockResolvedValueOnce(new Map());
    const res = await POST(
      makePostRequest({ programId: PROGRAM_ID, title: "Título", body: "Cuerpo" }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.thread.author).toEqual({
      id: ACTOR.id,
      full_name: "Usuario",
      avatar_url: null,
      is_staff: false,
    });
  });

  it("quita etiquetas HTML del título antes de guardarlo", async () => {
    const res = await POST(
      makePostRequest({
        programId: PROGRAM_ID,
        title: "<script>alert(1)</script>Hola",
        body: "Cuerpo",
      }),
    );
    expect(res.status).toBe(201);
    expect(mockState.lastInsertPayload).toMatchObject({ title: "alert(1)Hola" });
  });

  it("usa la categoría enviada cuando es válida", async () => {
    const res = await POST(
      makePostRequest({
        programId: PROGRAM_ID,
        title: "Título",
        body: "Cuerpo",
        category: "dudas",
      }),
    );
    expect(res.status).toBe(201);
    expect(mockState.lastInsertPayload).toMatchObject({ category: "dudas" });
  });

  it("hace fallback a categoría 'general' cuando la enviada es inválida", async () => {
    const res = await POST(
      makePostRequest({
        programId: PROGRAM_ID,
        title: "Título",
        body: "Cuerpo",
        category: "categoria-inventada",
      }),
    );
    expect(res.status).toBe(201);
    expect(mockState.lastInsertPayload).toMatchObject({ category: "general" });
  });
});
