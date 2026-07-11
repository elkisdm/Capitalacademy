import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const THREAD_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";
const COMMENT_ID = "c1b2c3d4-e5f6-7890-abcd-ef1234567890";
const PROGRAM_ID = "d1b2c3d4-e5f6-7890-abcd-ef1234567890";
const ACTOR = { id: "u-11111111-1111-1111-1111-111111111111" };
const THREAD_AUTHOR = "e2222222-2222-2222-2222-222222222222";

function makeUuid(i: number) {
  return `d${String(i).padStart(7, "0")}-0000-0000-0000-000000000000`;
}

function makeRequest(method: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/classroom/conversaciones/comments", init);
}

// ── Mutable mock state ───────────────────────────────────────

const mockState = {
  user: ACTOR as { id: string } | null,
  tables: {} as Record<string, { data: unknown; error: unknown }>,
};

const adminState = {
  tables: {} as Record<string, { data: unknown; error: unknown; count?: number }>,
  inserts: [] as Array<{ table: string; rows: unknown }>,
  calls: [] as Array<{ table: string; prop: string }>,
};

const mockCheck = vi.fn();

function tableResult(table: string) {
  return mockState.tables[table] ?? { data: null, error: null };
}

function createQueryBuilder(table: string) {
  const make = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve(tableResult(table));
          }
          if (prop === "single" || prop === "maybeSingle") {
            return () => Promise.resolve(tableResult(table));
          }
          if (
            ["select", "eq", "order", "insert", "delete", "update", "in", "is", "gte", "or"].includes(
              prop,
            )
          ) {
            return (..._args: unknown[]) => make();
          }
          return undefined;
        },
      },
    );
  return make();
}

function adminTableResult(table: string) {
  return adminState.tables[table] ?? { data: [], error: null, count: 0 };
}

function createAdminBuilder(table: string) {
  const make = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve(adminTableResult(table));
          }
          if (prop === "single" || prop === "maybeSingle") {
            return () => Promise.resolve(adminTableResult(table));
          }
          if (prop === "insert") {
            return (rows: unknown) => {
              adminState.inserts.push({ table, rows });
              return make();
            };
          }
          if (["select", "eq", "order", "delete", "update", "in", "is", "gte", "or"].includes(prop)) {
            return (..._args: unknown[]) => {
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

// ── Module mocks (hoisted by vitest) ─────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockState.user } }),
    },
    from: (table: string) => createQueryBuilder(table),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => createAdminBuilder(table),
  }),
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
  getPublicAuthorsMap: vi.fn(async (ids: Array<string | null | undefined>) => {
    const map = new Map();
    for (const id of ids) {
      if (id) map.set(id, { id, full_name: "Actor Test", avatar_url: null, is_staff: false });
    }
    return map;
  }),
}));

vi.mock("@/lib/email/conversacion-notification", () => ({
  sendConversacionNotificationEmail: vi.fn(async () => {}),
}));

// ── Import handlers (AFTER mocks) ────────────────────────────

const { POST } = await import("@/app/api/classroom/conversaciones/comments/route");

// ── Reset state before each test ─────────────────────────────

beforeEach(() => {
  mockState.user = ACTOR;
  mockState.tables = {};
  adminState.tables = {};
  adminState.inserts = [];
  adminState.calls = [];
  mockCheck.mockReturnValue({ ok: true, remaining: 19, resetAt: Date.now() + 60_000 });
});

describe("POST /api/classroom/conversaciones/comments", () => {
  it("rechaza mentions con más de 10 elementos (422)", async () => {
    const mentions = Array.from({ length: 11 }, (_, i) => makeUuid(i));

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, body: "hola", mentions }),
    );
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.issues).toBeDefined();
  });

  it("mencionar al autor del hilo no genera notificación mention duplicada", async () => {
    mockState.tables["conversation_threads"] = {
      data: {
        id: THREAD_ID,
        is_locked: false,
        author_id: THREAD_AUTHOR,
        title: "Thread Title",
        program_id: PROGRAM_ID,
      },
      error: null,
    };
    mockState.tables["conversation_comments"] = {
      data: {
        id: COMMENT_ID,
        body: "hola @mencion",
        parent_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        edited_at: null,
      },
      error: null,
    };

    const res = await POST(
      makeRequest("POST", {
        threadId: THREAD_ID,
        body: "hola @mencion",
        mentions: [THREAD_AUTHOR],
      }),
    );
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.comment).toBeDefined();

    // El autor del hilo queda excluido de validMentions (ya recibe 'reply' vía
    // el trigger de BD) -> notifyAndEmail nunca inserta una fila 'mention'.
    const mentionInserts = adminState.inserts.filter(
      (i) => i.table === "conversation_notifications",
    );
    expect(mentionInserts.length).toBe(0);

    // Confirma que el flujo de reply sí se ejecutó (no se abortó antes de
    // llegar a la resolución de menciones): busca el perfil del destinatario.
    const profileCalls = adminState.calls.filter((c) => c.table === "profiles");
    expect(profileCalls.length).toBeGreaterThan(0);
  });
});
