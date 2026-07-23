import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const THREAD_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";
const COMMENT_ID = "c1b2c3d4-e5f6-7890-abcd-ef1234567890";
const PROGRAM_ID = "d1b2c3d4-e5f6-7890-abcd-ef1234567890";
const PARENT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const ACTOR = { id: "u-11111111-1111-1111-1111-111111111111" };
const THREAD_AUTHOR = "e2222222-2222-2222-2222-222222222222";
const PARENT_AUTHOR = "f3333333-3333-3333-3333-333333333333";
const CANDIDATE = "a4444444-4444-4444-4444-444444444444";
const COHORT_ID = "b5555555-5555-5555-5555-555555555555";

function makeUuid(i: number) {
  return `d${String(i).padStart(7, "0")}-0000-0000-0000-000000000000`;
}

function makeRequest(method: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/classroom/conversaciones/comments", init);
}

function makeRawRequest(method: string, rawBody: string) {
  return new Request("http://localhost/api/classroom/conversaciones/comments", {
    method,
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

function makeDeleteRequest(id?: string) {
  const url = id
    ? `http://localhost/api/classroom/conversaciones/comments?id=${id}`
    : "http://localhost/api/classroom/conversaciones/comments";
  return new Request(url, { method: "DELETE" });
}

// ── Mutable mock state (cliente de usuario: supabase/server) ────────
// El endpoint usa `conversation_comments` para 3 operaciones distintas
// (lookup del padre, insert del POST, update del PATCH/DELETE) — se
// diferencian por el rastro de llamadas de cada cadena (`calls`).

const mockState = {
  user: ACTOR as { id: string } | null,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  parentResult: { data: null as unknown, error: null as unknown },
  insertResult: { data: null as unknown, error: null as unknown },
  patchResult: { data: null as unknown, error: null as unknown },
  deleteResult: { data: [] as unknown, error: null as unknown },
};

function resolveLocal(
  table: string,
  calls: Array<{ prop: string; args: unknown[] }>,
  terminal: "then" | "single" | "maybeSingle",
) {
  if (table === "conversation_comments") {
    const hasInsert = calls.some((c) => c.prop === "insert");
    const hasUpdate = calls.some((c) => c.prop === "update");
    if (hasInsert) return mockState.insertResult;
    if (hasUpdate && terminal === "maybeSingle") return mockState.patchResult;
    if (hasUpdate) return mockState.deleteResult;
    return mockState.parentResult;
  }
  return mockState.tables[table] ?? { data: null, error: null };
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
              resolve(resolveLocal(table, calls, "then"));
          }
          if (prop === "single") {
            return () => Promise.resolve(resolveLocal(table, calls, "single"));
          }
          if (prop === "maybeSingle") {
            return () => Promise.resolve(resolveLocal(table, calls, "maybeSingle"));
          }
          if (
            ["select", "eq", "order", "insert", "delete", "update", "in", "is", "gte", "or"].includes(
              prop,
            )
          ) {
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

// ── Mutable mock state (cliente admin: supabase/admin) ───────────────
// `profiles` y `conversation_notifications` se consultan más de una vez
// por request con propósitos distintos; se diferencian por el rastro de
// llamadas de cada cadena en vez de por tabla a secas.

const adminState = {
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  staffRows: { data: [] as unknown, error: null as unknown },
  profilesBulk: { data: [] as unknown, error: null as unknown },
  recipientProfiles: {} as Record<string, { data: unknown; error: unknown }>,
  cooldowns: {} as Record<string, { data: unknown; error: unknown; count?: number }>,
  inserts: [] as Array<{ table: string; rows: unknown }>,
  calls: [] as Array<{ table: string; prop: string }>,
};

function resolveAdminProfiles(calls: Array<{ prop: string; args: unknown[] }>) {
  const hasOr = calls.some((c) => c.prop === "or");
  const hasIn = calls.some((c) => c.prop === "in");
  if (hasOr) return adminState.staffRows;
  if (hasIn) return adminState.profilesBulk;
  const eqId = calls.find((c) => c.prop === "eq" && c.args[0] === "id");
  const uid = eqId?.args[1] as string | undefined;
  return (uid && adminState.recipientProfiles[uid]) ?? { data: null, error: null };
}

function resolveAdminNotifications(calls: Array<{ prop: string; args: unknown[] }>) {
  const hasGte = calls.some((c) => c.prop === "gte");
  if (!hasGte) return { data: [], error: null };
  const eqUser = calls.find((c) => c.prop === "eq" && c.args[0] === "user_id");
  const uid = eqUser?.args[1] as string | undefined;
  return (uid && adminState.cooldowns[uid]) ?? { data: [], error: null, count: 0 };
}

function resolveAdmin(table: string, calls: Array<{ prop: string; args: unknown[] }>) {
  if (table === "profiles") return resolveAdminProfiles(calls);
  if (table === "conversation_notifications") return resolveAdminNotifications(calls);
  return adminState.tables[table] ?? { data: [], error: null, count: 0 };
}

function createAdminBuilder(table: string) {
  const calls: Array<{ prop: string; args: unknown[] }> = [];
  const make = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve(resolveAdmin(table, calls));
          }
          if (prop === "single" || prop === "maybeSingle") {
            return () => Promise.resolve(resolveAdmin(table, calls));
          }
          if (prop === "insert") {
            return (rows: unknown) => {
              calls.push({ prop, args: [rows] });
              adminState.inserts.push({ table, rows });
              return make();
            };
          }
          if (["select", "eq", "order", "delete", "update", "in", "is", "gte", "or"].includes(prop)) {
            return (...args: unknown[]) => {
              calls.push({ prop, args });
              adminState.calls.push({ table, prop });
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

const mockCheck = vi.fn();
const mockCreateAdminClient = vi.fn((..._args: unknown[]) => ({
  from: (table: string) => createAdminBuilder(table),
}));
const mockGetPublicAuthorsMap = vi.fn(async (ids: Array<string | null | undefined>) => {
  const map = new Map();
  for (const id of ids) {
    if (id) map.set(id, { id, full_name: "Actor Test", avatar_url: null, is_staff: false });
  }
  return map;
});
const mockSendEmail = vi.fn(async (..._args: unknown[]) => ({ success: true }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockState.user } }),
    },
    from: (table: string) => createQueryBuilder(table),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({ check: (...args: unknown[]) => mockCheck(...args) }),
  rateLimitResponse: () =>
    Response.json(
      { error: "Demasiadas solicitudes. Intenta nuevamente más tarde." },
      { status: 429 },
    ),
}));

vi.mock("@/lib/profiles/public-authors", () => ({
  getPublicAuthorsMap: (...args: [Array<string | null | undefined>]) =>
    mockGetPublicAuthorsMap(...args),
}));

vi.mock("@/lib/email/conversacion-notification", () => ({
  sendConversacionNotificationEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

// ── Import handlers (DESPUÉS de los mocks) ────────────────────

const { POST, PATCH, DELETE } = await import("@/app/api/classroom/conversaciones/comments/route");

// ── Reset de estado antes de cada test ─────────────────────────

function setValidThread(overrides: Partial<Record<string, unknown>> = {}) {
  mockState.tables["conversation_threads"] = {
    data: {
      id: THREAD_ID,
      is_locked: false,
      author_id: THREAD_AUTHOR,
      title: "Thread Title",
      program_id: PROGRAM_ID,
      ...overrides,
    },
    error: null,
  };
}

beforeEach(() => {
  mockState.user = ACTOR;
  mockState.tables = {};
  mockState.parentResult = { data: null, error: null };
  mockState.insertResult = {
    data: {
      id: COMMENT_ID,
      body: "hola",
      parent_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      edited_at: null,
    },
    error: null,
  };
  mockState.patchResult = { data: null, error: null };
  mockState.deleteResult = { data: [], error: null };

  adminState.tables = {};
  adminState.staffRows = { data: [], error: null };
  adminState.profilesBulk = { data: [], error: null };
  adminState.recipientProfiles = {};
  adminState.cooldowns = {};
  adminState.inserts = [];
  adminState.calls = [];

  mockCheck.mockReset();
  mockCheck.mockReturnValue({ ok: true, remaining: 19, resetAt: Date.now() + 60_000 });
  mockCreateAdminClient.mockClear();
  mockCreateAdminClient.mockImplementation(() => ({
    from: (table: string) => createAdminBuilder(table),
  }));
  mockGetPublicAuthorsMap.mockClear();
  mockSendEmail.mockClear();

  setValidThread();
});

// ── POST ─────────────────────────────────────────────────────

describe("POST /api/classroom/conversaciones/comments", () => {
  it("responde 401 si no hay usuario autenticado", async () => {
    mockState.user = null;
    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola" }));
    expect(res.status).toBe(401);
  });

  it("responde 429 si se supera el rate limit", async () => {
    mockCheck.mockReturnValue({ ok: false, remaining: 0, resetAt: Date.now() + 1000 });
    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola" }));
    expect(res.status).toBe(429);
  });

  it("responde 400 si el body no es JSON válido", async () => {
    const res = await POST(makeRawRequest("POST", "{esto no es json"));
    expect(res.status).toBe(400);
  });

  it("responde 422 si la validación falla (threadId faltante)", async () => {
    const res = await POST(makeRequest("POST", { body: "hola" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.issues).toBeDefined();
  });

  it("rechaza mentions con más de 10 elementos (422)", async () => {
    const mentions = Array.from({ length: 11 }, (_, i) => makeUuid(i));
    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola", mentions }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.issues).toBeDefined();
  });

  it("responde 404 si el hilo no existe (data null, sin error)", async () => {
    mockState.tables["conversation_threads"] = { data: null, error: null };
    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola" }));
    expect(res.status).toBe(404);
  });

  it("responde 404 si la consulta del hilo devuelve error", async () => {
    mockState.tables["conversation_threads"] = { data: null, error: { message: "db down" } };
    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola" }));
    expect(res.status).toBe(404);
  });

  it("responde 403 si el hilo está bloqueado", async () => {
    setValidThread({ is_locked: true });
    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Esta conversación está cerrada");
  });

  it("responde 404 si el comentario padre no existe", async () => {
    mockState.parentResult = { data: null, error: null };
    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, body: "hola", parentId: PARENT_ID }),
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Comentario padre no encontrado");
  });

  it("responde 422 si el padre ya es una respuesta (más de 1 nivel)", async () => {
    mockState.parentResult = {
      data: { id: PARENT_ID, parent_id: "otro-id-cualquiera", author_id: PARENT_AUTHOR },
      error: null,
    };
    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, body: "hola", parentId: PARENT_ID }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Solo se permite 1 nivel de respuesta");
  });

  it("responde 500 si el insert del comentario falla", async () => {
    mockState.insertResult = { data: null, error: { message: "insert failed" } };
    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola" }));
    expect(res.status).toBe(500);
  });

  it("crea el comentario (201) y arma la forma esperada de la respuesta", async () => {
    adminState.recipientProfiles[THREAD_AUTHOR] = {
      data: { full_name: "Autor Hilo", email: "autor@x.cl" },
      error: null,
    };

    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola" }));
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.comment).toEqual({
      id: COMMENT_ID,
      body: "hola",
      parent_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      edited_at: null,
      deleted: false,
      author: { id: ACTOR.id, full_name: "Actor Test", avatar_url: null, is_staff: false },
      reaction_count: 0,
      reactions: [],
      viewer_reaction: null,
    });

    // El autor del hilo (!= actor) recibe email de 'reply'.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "autor@x.cl", kind: "reply" }),
    );
  });

  it("usa el autor de respaldo cuando getPublicAuthorsMap no resuelve el perfil", async () => {
    mockGetPublicAuthorsMap.mockResolvedValueOnce(new Map());
    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.comment.author).toEqual({
      id: ACTOR.id,
      full_name: "Usuario",
      avatar_url: null,
      is_staff: false,
    });
  });

  it("no envía email de reply cuando el autor del hilo es el propio actor", async () => {
    setValidThread({ author_id: ACTOR.id });
    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola" }));
    expect(res.status).toBe(201);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("con parentId resuelve parentAuthorId y notifica a ambos autores si difieren", async () => {
    mockState.parentResult = {
      data: { id: PARENT_ID, parent_id: null, author_id: PARENT_AUTHOR },
      error: null,
    };
    adminState.recipientProfiles[THREAD_AUTHOR] = {
      data: { full_name: "Autor Hilo", email: "hilo@x.cl" },
      error: null,
    };
    adminState.recipientProfiles[PARENT_AUTHOR] = {
      data: { full_name: "Autor Padre", email: "padre@x.cl" },
      error: null,
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, body: "hola", parentId: PARENT_ID }),
    );
    expect(res.status).toBe(201);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it("deduplica destinatarios de reply cuando el autor del hilo y del padre coinciden", async () => {
    mockState.parentResult = {
      data: { id: PARENT_ID, parent_id: null, author_id: THREAD_AUTHOR },
      error: null,
    };
    adminState.recipientProfiles[THREAD_AUTHOR] = {
      data: { full_name: "Autor Hilo", email: "hilo@x.cl" },
      error: null,
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, body: "hola", parentId: PARENT_ID }),
    );
    expect(res.status).toBe(201);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("no notifica a nadie cuando el actor es autor del hilo y de su propio comentario padre", async () => {
    setValidThread({ author_id: ACTOR.id });
    mockState.parentResult = {
      data: { id: PARENT_ID, parent_id: null, author_id: ACTOR.id },
      error: null,
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, body: "hola", parentId: PARENT_ID }),
    );
    expect(res.status).toBe(201);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("mencionar al autor del hilo no genera notificación mention duplicada", async () => {
    const res = await POST(
      makeRequest("POST", {
        threadId: THREAD_ID,
        body: "hola @mencion",
        mentions: [THREAD_AUTHOR],
      }),
    );
    expect(res.status).toBe(201);

    // El autor del hilo queda excluido de validMentions (ya recibe 'reply' vía
    // el trigger de BD) -> notifyAndEmail nunca inserta una fila 'mention'.
    const mentionInserts = adminState.inserts.filter(
      (i) => i.table === "conversation_notifications",
    );
    expect(mentionInserts.length).toBe(0);
  });

  it("no envía email a un destinatario en cooldown (> 1 notificación reply en la última hora)", async () => {
    adminState.cooldowns[THREAD_AUTHOR] = { data: [], error: null, count: 2 };
    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola" }));
    expect(res.status).toBe(201);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("no envía email de reply si el perfil del destinatario no tiene email", async () => {
    adminState.recipientProfiles[THREAD_AUTHOR] = {
      data: { full_name: "Sin Correo", email: null },
      error: null,
    };
    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola" }));
    expect(res.status).toBe(201);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("notifica y envía email a un mencionado matriculado (active) en el programa", async () => {
    setValidThread({ author_id: ACTOR.id }); // aísla el flujo de mentions
    adminState.tables["enrollments"] = { data: [{ student_id: CANDIDATE }], error: null };
    adminState.tables["cohorts"] = { data: [{ id: COHORT_ID }], error: null };
    adminState.tables["cohort_roles"] = { data: [], error: null };
    adminState.profilesBulk = {
      data: [{ id: CANDIDATE, full_name: "Candidato Uno", email: "cand@x.cl" }],
      error: null,
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, body: "hola @cand", mentions: [CANDIDATE] }),
    );
    expect(res.status).toBe(201);

    const mentionInserts = adminState.inserts.filter(
      (i) => i.table === "conversation_notifications",
    );
    expect(mentionInserts.length).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "cand@x.cl", kind: "mention" }),
    );
  });

  it("excluye a un mencionado sin matrícula ni rol staff en el programa (anti cross-tenant)", async () => {
    setValidThread({ author_id: ACTOR.id });
    adminState.tables["enrollments"] = { data: [], error: null };
    adminState.tables["cohorts"] = { data: [], error: null };
    adminState.staffRows = { data: [], error: null };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, body: "hola @cand", mentions: [CANDIDATE] }),
    );
    expect(res.status).toBe(201);

    const mentionInserts = adminState.inserts.filter(
      (i) => i.table === "conversation_notifications",
    );
    expect(mentionInserts.length).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("incluye a un mencionado que es teacher/assistant de una cohorte del programa", async () => {
    setValidThread({ author_id: ACTOR.id });
    adminState.tables["enrollments"] = { data: [], error: null };
    adminState.tables["cohorts"] = { data: [{ id: COHORT_ID }], error: null };
    adminState.tables["cohort_roles"] = { data: [{ user_id: CANDIDATE }], error: null };
    adminState.profilesBulk = {
      data: [{ id: CANDIDATE, full_name: "Profe Asistente", email: "asist@x.cl" }],
      error: null,
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, body: "hola @cand", mentions: [CANDIDATE] }),
    );
    expect(res.status).toBe(201);
    const mentionInserts = adminState.inserts.filter(
      (i) => i.table === "conversation_notifications",
    );
    expect(mentionInserts.length).toBe(1);
  });

  it("incluye a un mencionado admin/ops vía profiles y omite cohort_roles si no hay cohortes", async () => {
    setValidThread({ author_id: ACTOR.id });
    adminState.tables["enrollments"] = { data: [], error: null };
    adminState.tables["cohorts"] = { data: [], error: null }; // sin cohortes -> cohortIds.length === 0
    adminState.staffRows = { data: [{ id: CANDIDATE }], error: null };
    adminState.profilesBulk = {
      data: [{ id: CANDIDATE, full_name: "Admin CI", email: "admin@x.cl" }],
      error: null,
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, body: "hola @cand", mentions: [CANDIDATE] }),
    );
    expect(res.status).toBe(201);

    const mentionInserts = adminState.inserts.filter(
      (i) => i.table === "conversation_notifications",
    );
    expect(mentionInserts.length).toBe(1);
    // La query de cohort_roles nunca se ejecuta porque cohortIds quedó vacío.
    expect(adminState.calls.some((c) => c.table === "cohort_roles")).toBe(false);
  });

  it("inserta la notificación mention aunque el perfil no tenga email (pero no manda correo)", async () => {
    setValidThread({ author_id: ACTOR.id });
    adminState.tables["enrollments"] = { data: [{ student_id: CANDIDATE }], error: null };
    adminState.tables["cohorts"] = { data: [], error: null };
    adminState.profilesBulk = {
      data: [{ id: CANDIDATE, full_name: "Sin Correo", email: null }],
      error: null,
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, body: "hola @cand", mentions: [CANDIDATE] }),
    );
    expect(res.status).toBe(201);

    const mentionInserts = adminState.inserts.filter(
      (i) => i.table === "conversation_notifications",
    );
    expect(mentionInserts.length).toBe(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("no rompe la creación del comentario si notifyAndEmail lanza un error inesperado", async () => {
    mockCreateAdminClient.mockImplementationOnce(() => {
      throw new Error("admin client boom");
    });

    const res = await POST(makeRequest("POST", { threadId: THREAD_ID, body: "hola" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.comment.id).toBe(COMMENT_ID);
  });
});

// ── PATCH ────────────────────────────────────────────────────

describe("PATCH /api/classroom/conversaciones/comments", () => {
  it("responde 401 si no hay usuario autenticado", async () => {
    mockState.user = null;
    const res = await PATCH(makeRequest("PATCH", { id: COMMENT_ID, body: "nuevo" }));
    expect(res.status).toBe(401);
  });

  it("responde 400 si el body no es JSON válido", async () => {
    const res = await PATCH(makeRawRequest("PATCH", "{esto no es json"));
    expect(res.status).toBe(400);
  });

  it("responde 422 si la validación falla (body vacío)", async () => {
    const res = await PATCH(makeRequest("PATCH", { id: COMMENT_ID, body: "" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.issues).toBeDefined();
  });

  it("responde 403 cuando la RLS deniega con código 42501", async () => {
    mockState.patchResult = { data: null, error: { code: "42501", message: "denied" } };
    const res = await PATCH(makeRequest("PATCH", { id: COMMENT_ID, body: "nuevo texto" }));
    expect(res.status).toBe(403);
  });

  it("responde 403 cuando la RLS deniega con código PGRST301", async () => {
    mockState.patchResult = { data: null, error: { code: "PGRST301", message: "denied" } };
    const res = await PATCH(makeRequest("PATCH", { id: COMMENT_ID, body: "nuevo texto" }));
    expect(res.status).toBe(403);
  });

  it("responde 500 ante un error genérico de base de datos", async () => {
    mockState.patchResult = { data: null, error: { code: "XXYYZ", message: "boom" } };
    const res = await PATCH(makeRequest("PATCH", { id: COMMENT_ID, body: "nuevo texto" }));
    expect(res.status).toBe(500);
  });

  it("responde 404 si no hay fila (comentario no encontrado o filtrado por RLS)", async () => {
    mockState.patchResult = { data: null, error: null };
    const res = await PATCH(makeRequest("PATCH", { id: COMMENT_ID, body: "nuevo texto" }));
    expect(res.status).toBe(404);
  });

  it("edita el comentario y responde 200 con el autor resuelto", async () => {
    mockState.patchResult = {
      data: {
        id: COMMENT_ID,
        body: "nuevo texto",
        parent_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        edited_at: "2026-01-02T00:00:00.000Z",
        author_id: ACTOR.id,
      },
      error: null,
    };

    const res = await PATCH(makeRequest("PATCH", { id: COMMENT_ID, body: "nuevo texto" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.comment).toEqual({
      id: COMMENT_ID,
      body: "nuevo texto",
      parent_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      edited_at: "2026-01-02T00:00:00.000Z",
      author_id: ACTOR.id,
      deleted: false,
      author: { id: ACTOR.id, full_name: "Actor Test", avatar_url: null, is_staff: false },
    });
  });

  it("usa el autor de respaldo si getPublicAuthorsMap no resuelve el perfil", async () => {
    mockState.patchResult = {
      data: {
        id: COMMENT_ID,
        body: "nuevo texto",
        parent_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        edited_at: "2026-01-02T00:00:00.000Z",
        author_id: ACTOR.id,
      },
      error: null,
    };
    mockGetPublicAuthorsMap.mockResolvedValueOnce(new Map());

    const res = await PATCH(makeRequest("PATCH", { id: COMMENT_ID, body: "nuevo texto" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.comment.author).toEqual({
      id: ACTOR.id,
      full_name: "Usuario",
      avatar_url: null,
      is_staff: false,
    });
  });
});

// ── DELETE ───────────────────────────────────────────────────

describe("DELETE /api/classroom/conversaciones/comments", () => {
  it("responde 401 si no hay usuario autenticado", async () => {
    mockState.user = null;
    const res = await DELETE(makeDeleteRequest(COMMENT_ID));
    expect(res.status).toBe(401);
  });

  it("responde 422 si falta el parámetro id", async () => {
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(422);
  });

  it("responde 422 si el id no es un UUID válido", async () => {
    const res = await DELETE(makeDeleteRequest("no-es-un-uuid"));
    expect(res.status).toBe(422);
  });

  it("responde 403 cuando la RLS deniega con código 42501", async () => {
    mockState.deleteResult = { data: null, error: { code: "42501", message: "denied" } };
    const res = await DELETE(makeDeleteRequest(COMMENT_ID));
    expect(res.status).toBe(403);
  });

  it("responde 403 cuando la RLS deniega con código PGRST301", async () => {
    mockState.deleteResult = { data: null, error: { code: "PGRST301", message: "denied" } };
    const res = await DELETE(makeDeleteRequest(COMMENT_ID));
    expect(res.status).toBe(403);
  });

  it("responde 500 ante un error genérico de base de datos", async () => {
    mockState.deleteResult = { data: null, error: { code: "XXYYZ", message: "boom" } };
    const res = await DELETE(makeDeleteRequest(COMMENT_ID));
    expect(res.status).toBe(500);
  });

  it("responde 404 cuando la RLS filtra en silencio (0 filas, sin error)", async () => {
    mockState.deleteResult = { data: [], error: null };
    const res = await DELETE(makeDeleteRequest(COMMENT_ID));
    expect(res.status).toBe(404);
  });

  it("elimina (soft delete) y responde 200 con ok:true", async () => {
    mockState.deleteResult = { data: [{ id: COMMENT_ID }], error: null };
    const res = await DELETE(makeDeleteRequest(COMMENT_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });
});
