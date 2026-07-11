import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const FAKE_USER = { id: "u-11111111-1111-1111-1111-111111111111" };
const ID_1 = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const ID_2 = "a2b2c3d4-e5f6-7890-abcd-ef1234567890";

function makeRequest(method: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/classroom/conversaciones/notifications", init);
}

// ── Mutable mock state ───────────────────────────────────────
// Captura los argumentos de `.in()` / `.is()` / `.eq()` para verificar cuál
// rama de la mutación ({id} / {ids} / {all}) se ejecutó.

const mockState = {
  user: FAKE_USER as { id: string } | null,
  inArgs: null as [string, unknown[]] | null,
  isArgs: null as [string, unknown] | null,
  eqArgs: null as [string, unknown] | null,
  updateError: null as unknown,
};

function createQueryBuilder() {
  const make = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) =>
              resolve({ error: mockState.updateError });
          }
          if (prop === "in") {
            return (col: string, vals: unknown[]) => {
              mockState.inArgs = [col, vals];
              return make();
            };
          }
          if (prop === "is") {
            return (col: string, val: unknown) => {
              mockState.isArgs = [col, val];
              return make();
            };
          }
          if (prop === "eq") {
            return (col: string, val: unknown) => {
              mockState.eqArgs = [col, val];
              return make();
            };
          }
          if (["update", "select", "order", "limit"].includes(prop)) {
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

vi.mock("@/lib/profiles/public-authors", () => ({
  getPublicAuthorsMap: vi.fn(async () => new Map()),
}));

// ── Import handlers (AFTER mocks) ────────────────────────────

const { POST } = await import("@/app/api/classroom/conversaciones/notifications/route");

// ── Reset state before each test ─────────────────────────────

beforeEach(() => {
  mockState.user = FAKE_USER;
  mockState.inArgs = null;
  mockState.isArgs = null;
  mockState.eqArgs = null;
  mockState.updateError = null;
});

describe("POST /api/classroom/conversaciones/notifications", () => {
  it("marca leídas solo las notificaciones de { ids } (no todas)", async () => {
    const res = await POST(makeRequest("POST", { ids: [ID_1, ID_2] }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);

    // Rama `ids`: usa `.in("id", ids)`, no `.is("read_at", null)` (rama `all`)
    // ni `.eq("id", id)` (rama de una sola).
    expect(mockState.inArgs).toEqual(["id", [ID_1, ID_2]]);
    expect(mockState.isArgs).toBeNull();
    expect(mockState.eqArgs).toBeNull();
  });
});
