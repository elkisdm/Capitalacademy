import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const FAKE_USER = { id: "u-11111111-1111-1111-1111-111111111111" };

function makeRequest(
  method: string,
  params?: Record<string, string>,
  body?: unknown,
) {
  const url = new URL("http://localhost/api/classroom/comments");
  if (params)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(url.toString(), init);
}

// ── Mutable mock state (read at call-time by mock factories) ─

const mockState = {
  user: FAKE_USER as { id: string } | null,
  queryData: [] as unknown,
  queryError: null as unknown,
};

const mockCheck = vi.fn();

// ── Supabase query builder ───────────────────────────────────
// Returns a chainable proxy that resolves to { data, error }
// when awaited. Supports .from().select().eq().order().insert().single()
// .delete().limit().maybeSingle().update()

function createQueryBuilder() {
  const make = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          // Make the proxy thenable so `await supabase.from(...)...` resolves
          if (prop === "then") {
            return (resolve: (v: unknown) => void) =>
              resolve({
                data: mockState.queryData,
                error: mockState.queryError,
              });
          }
          if (prop === "single" || prop === "maybeSingle") {
            return () =>
              Promise.resolve({
                data: mockState.queryData,
                error: mockState.queryError,
              });
          }
          if (
            [
              "from",
              "select",
              "eq",
              "order",
              "insert",
              "delete",
              "limit",
              "update",
            ].includes(prop)
          ) {
            return (..._args: unknown[]) => make();
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
      getUser: () =>
        Promise.resolve({ data: { user: mockState.user } }),
    },
    from: (..._args: unknown[]) => createQueryBuilder(),
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

vi.mock("@/lib/profiles/public-authors", () => ({
  getPublicAuthorsMap: vi.fn(async (ids: Array<string | null | undefined>) => {
    const map = new Map();
    for (const id of ids) {
      if (id) {
        map.set(id, {
          id,
          full_name: "Autor Test",
          avatar_url: null,
          is_staff: false,
        });
      }
    }
    return map;
  }),
}));

vi.mock("@/lib/profiles/program-staff", () => ({
  getProgramStaffIds: vi.fn(async () => new Set<string>()),
}));

vi.mock("@/lib/notifications/lesson-comment", () => ({
  notifyLessonComment: vi.fn(async () => {}),
}));

// ── Import handlers (AFTER mocks) ────────────────────────────

const { GET, POST, DELETE, PATCH } = await import(
  "@/app/api/classroom/comments/route"
);

// ── Reset state before each test ─────────────────────────────

beforeEach(() => {
  mockState.user = FAKE_USER;
  mockState.queryData = [];
  mockState.queryError = null;
  mockCheck.mockReturnValue({
    ok: true,
    remaining: 9,
    resetAt: Date.now() + 60_000,
  });
});

// ── GET ──────────────────────────────────────────────────────

describe("GET /api/classroom/comments", () => {
  it("returns 401 when not authenticated", async () => {
    mockState.user = null;

    const res = await GET(makeRequest("GET", { lessonId: VALID_UUID }));
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 422 when lessonId is missing", async () => {
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.error).toMatch(/lessonId/);
  });

  it("returns 422 when lessonId is not a valid UUID", async () => {
    const res = await GET(makeRequest("GET", { lessonId: "not-a-uuid" }));
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.error).toMatch(/UUID/);
  });

  it("returns comments array on success", async () => {
    const mockRows = [
      {
        id: VALID_UUID,
        content: "Hello",
        parent_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: null,
        deleted_at: null,
        edited_at: null,
        author_id: FAKE_USER.id,
      },
    ];
    mockState.queryData = mockRows;

    const res = await GET(makeRequest("GET", { lessonId: VALID_UUID }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.hasMore).toBe(false);
    expect(json.comments).toEqual([
      {
        id: VALID_UUID,
        content: "Hello",
        parent_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: null,
        edited_at: null,
        deleted: false,
        profiles: {
          id: FAKE_USER.id,
          full_name: "Autor Test",
          avatar_url: null,
          is_staff: false,
        },
      },
    ]);
  });
});

// ── POST ─────────────────────────────────────────────────────

describe("POST /api/classroom/comments", () => {
  const validBody = { lessonId: VALID_UUID, content: "Great lesson!" };

  it("returns 401 when not authenticated", async () => {
    mockState.user = null;

    const res = await POST(makeRequest("POST", undefined, validBody));
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 429 when rate limited", async () => {
    mockCheck.mockReturnValue({
      ok: false,
      remaining: 0,
      resetAt: Date.now() + 30_000,
    });

    const res = await POST(makeRequest("POST", undefined, validBody));
    expect(res.status).toBe(429);

    const json = await res.json();
    expect(json.error).toMatch(/solicitudes/i);
  });

  it("returns 422 when body is missing required fields", async () => {
    const res = await POST(makeRequest("POST", undefined, {}));
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.issues).toBeDefined();
  });

  it("returns 422 when content exceeds 2000 chars", async () => {
    const res = await POST(
      makeRequest("POST", undefined, {
        lessonId: VALID_UUID,
        content: "x".repeat(2001),
      }),
    );
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.issues).toBeDefined();
  });

  it("returns 201 with created comment on success", async () => {
    const createdComment = {
      id: VALID_UUID,
      content: "Great lesson!",
      parent_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: null,
      deleted_at: null,
      edited_at: null,
      author_id: FAKE_USER.id,
    };
    mockState.queryData = createdComment;

    const res = await POST(makeRequest("POST", undefined, validBody));
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.comment).toEqual({
      id: VALID_UUID,
      content: "Great lesson!",
      parent_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: null,
      edited_at: null,
      deleted: false,
      profiles: {
        id: FAKE_USER.id,
        full_name: "Autor Test",
        avatar_url: null,
        is_staff: false,
      },
    });
  });
});

// ── DELETE ────────────────────────────────────────────────────
// Soft delete: update({deleted_at, content:""}).eq(id).select("id").
// 0 filas devueltas -> 404 (ajeno o inexistente).

describe("DELETE /api/classroom/comments", () => {
  it("returns 401 when not authenticated", async () => {
    mockState.user = null;

    const res = await DELETE(makeRequest("DELETE", { id: VALID_UUID }));
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 422 when id is missing", async () => {
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.error).toMatch(/id/);
  });

  it("returns 422 when id is not a valid UUID", async () => {
    const res = await DELETE(makeRequest("DELETE", { id: "bad-id" }));
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.error).toMatch(/UUID/);
  });

  it("returns { ok: true } on success", async () => {
    mockState.queryData = [{ id: VALID_UUID }];

    const res = await DELETE(makeRequest("DELETE", { id: VALID_UUID }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("returns 404 when the update affects 0 rows (ajeno o inexistente)", async () => {
    mockState.queryData = [];

    const res = await DELETE(makeRequest("DELETE", { id: VALID_UUID }));
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error).toBeDefined();
  });
});

// ── PATCH ────────────────────────────────────────────────────
// Edita el content propio y setea edited_at.

describe("PATCH /api/classroom/comments", () => {
  it("returns 401 when not authenticated", async () => {
    mockState.user = null;

    const res = await PATCH(
      makeRequest("PATCH", undefined, { id: VALID_UUID, content: "x" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 422 when content is empty", async () => {
    const res = await PATCH(
      makeRequest("PATCH", undefined, { id: VALID_UUID, content: "" }),
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when nothing was updated (ajeno o inexistente)", async () => {
    mockState.queryData = null;

    const res = await PATCH(
      makeRequest("PATCH", undefined, {
        id: VALID_UUID,
        content: "Updated content",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("edits content and sets edited_at on success", async () => {
    const editedAt = "2026-07-11T13:00:00.000Z";
    mockState.queryData = {
      id: VALID_UUID,
      content: "Updated content",
      parent_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: null,
      deleted_at: null,
      edited_at: editedAt,
      author_id: FAKE_USER.id,
      lesson_id: VALID_UUID,
    };

    const res = await PATCH(
      makeRequest("PATCH", undefined, {
        id: VALID_UUID,
        content: "Updated content",
      }),
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.comment.content).toBe("Updated content");
    expect(json.comment.edited_at).toBe(editedAt);
  });
});
