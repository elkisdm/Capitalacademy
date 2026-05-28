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
// when awaited. Supports .from().select().eq().order().insert().single().delete()

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
          if (
            [
              "from",
              "select",
              "eq",
              "order",
              "insert",
              "delete",
              "single",
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

// ── Import handlers (AFTER mocks) ────────────────────────────

const { GET, POST, DELETE } = await import(
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
    const mockComments = [
      { id: VALID_UUID, content: "Hello", parent_id: null },
    ];
    mockState.queryData = mockComments;

    const res = await GET(makeRequest("GET", { lessonId: VALID_UUID }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.comments).toEqual(mockComments);
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
    };
    mockState.queryData = createdComment;

    const res = await POST(makeRequest("POST", undefined, validBody));
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.comment).toEqual(createdComment);
  });
});

// ── DELETE ────────────────────────────────────────────────────

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
    const res = await DELETE(makeRequest("DELETE", { id: VALID_UUID }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
