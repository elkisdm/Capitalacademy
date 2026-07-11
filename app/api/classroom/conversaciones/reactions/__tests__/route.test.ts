import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const THREAD_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";
const FAKE_USER = { id: "u-11111111-1111-1111-1111-111111111111" };

function makeRequest(method: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/classroom/conversaciones/reactions", init);
}

// ── Mutable mock state ───────────────────────────────────────
// El endpoint hace 3 operaciones sobre `conversation_reactions` en la misma
// request: lookup (maybeSingle), insert/update/delete, y el select final de
// conteo agregado. Se diferencian por el último método de la cadena.

const mockState = {
  user: FAKE_USER as { id: string } | null,
  existingResult: { data: null as unknown, error: null as unknown },
  insertResult: { data: null as unknown, error: null as unknown },
  aggregateResult: { data: [] as unknown, error: null as unknown },
};

const mockCheck = vi.fn();

function createQueryBuilder() {
  let lastOp: "insert" | "other" = "other";
  const make = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) =>
              resolve(
                lastOp === "insert" ? mockState.insertResult : mockState.aggregateResult,
              );
          }
          if (prop === "maybeSingle") {
            return () => Promise.resolve(mockState.existingResult);
          }
          if (prop === "insert") {
            lastOp = "insert";
            return (..._args: unknown[]) => make();
          }
          if (["select", "eq", "delete", "update"].includes(prop)) {
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
      getUser: () => Promise.resolve({ data: { user: mockState.user } }),
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

const { POST } = await import("@/app/api/classroom/conversaciones/reactions/route");

// ── Reset state before each test ─────────────────────────────

beforeEach(() => {
  mockState.user = FAKE_USER;
  mockState.existingResult = { data: null, error: null };
  mockState.insertResult = { data: null, error: null };
  mockState.aggregateResult = { data: [], error: null };
  mockCheck.mockReturnValue({ ok: true, remaining: 29, resetAt: Date.now() + 60_000 });
});

describe("POST /api/classroom/conversaciones/reactions", () => {
  it("trata el error 23505 (doble-tap concurrente) como éxito idempotente, no 500", async () => {
    // Sin reacción previa -> intenta insertar -> el índice único ya la insertó
    // por una request concurrente (23505).
    mockState.existingResult = { data: null, error: null };
    mockState.insertResult = {
      data: null,
      error: { code: "23505", message: "duplicate key value" },
    };
    mockState.aggregateResult = {
      data: [{ emoji: "❤️", user_id: FAKE_USER.id }],
      error: null,
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, emoji: "❤️" }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reactions).toEqual([{ emoji: "❤️", count: 1 }]);
    expect(json.viewer_reaction).toBe("❤️");
  });
});
