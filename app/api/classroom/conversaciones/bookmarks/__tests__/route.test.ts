import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const THREAD_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";
const FAKE_USER = { id: "u-11111111-1111-1111-1111-111111111111" };

function makeRequest(body?: unknown) {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/classroom/conversaciones/bookmarks", init);
}

function makeRawRequest(rawBody: string) {
  return new Request("http://localhost/api/classroom/conversaciones/bookmarks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

// ── Mutable mock state ───────────────────────────────────────
// El endpoint hace hasta 2 operaciones sobre `conversation_bookmarks`:
// lookup (maybeSingle) y luego delete o insert, según exista o no.

const mockState = {
  user: FAKE_USER as { id: string } | null,
  existingResult: { data: null as unknown, error: null as unknown },
  deleteResult: { data: null as unknown, error: null as unknown },
  insertResult: { data: null as unknown, error: null as unknown },
};

const mockCheck = vi.fn();

function createQueryBuilder() {
  let lastOp: "lookup" | "delete" | "insert" = "lookup";
  const make = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => {
              if (lastOp === "delete") return resolve(mockState.deleteResult);
              if (lastOp === "insert") return resolve(mockState.insertResult);
              return resolve(mockState.existingResult);
            };
          }
          if (prop === "maybeSingle") {
            return () => Promise.resolve(mockState.existingResult);
          }
          if (prop === "delete") {
            lastOp = "delete";
            return (..._args: unknown[]) => make();
          }
          if (prop === "insert") {
            lastOp = "insert";
            return (..._args: unknown[]) => make();
          }
          if (["select", "eq"].includes(prop)) {
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

// ── Import handler (AFTER mocks) ──────────────────────────────

const { POST } = await import("@/app/api/classroom/conversaciones/bookmarks/route");

// ── Reset state before each test ──────────────────────────────

beforeEach(() => {
  mockState.user = FAKE_USER;
  mockState.existingResult = { data: null, error: null };
  mockState.deleteResult = { data: null, error: null };
  mockState.insertResult = { data: null, error: null };
  mockCheck.mockReturnValue({ ok: true, remaining: 29, resetAt: Date.now() + 60_000 });
});

describe("POST /api/classroom/conversaciones/bookmarks", () => {
  it("responde 401 si no hay usuario autenticado", async () => {
    mockState.user = null;

    const res = await POST(makeRequest({ threadId: THREAD_ID }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
  });

  it("responde 429 cuando se supera el límite de tasa", async () => {
    mockCheck.mockReturnValue({ ok: false, remaining: 0, resetAt: Date.now() + 1000 });

    const res = await POST(makeRequest({ threadId: THREAD_ID }));

    expect(res.status).toBe(429);
  });

  it("responde 400 si el body no es JSON válido", async () => {
    const res = await POST(makeRawRequest("{esto no es json"));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Body invalido");
  });

  it("responde 422 si threadId no cumple el formato uuid-like", async () => {
    const res = await POST(makeRequest({ threadId: "no-es-un-uuid" }));

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
    expect(json.issues).toBeTruthy();
  });

  it("responde 422 si falta threadId", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(422);
  });

  it("responde 500 si falla el lookup del bookmark existente", async () => {
    mockState.existingResult = {
      data: null,
      error: { code: "500", message: "db down" },
    };

    const res = await POST(makeRequest({ threadId: THREAD_ID }));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al procesar el guardado");
  });

  it("elimina el bookmark existente y responde bookmarked:false", async () => {
    mockState.existingResult = { data: { thread_id: THREAD_ID }, error: null };
    mockState.deleteResult = { data: null, error: null };

    const res = await POST(makeRequest({ threadId: THREAD_ID }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.bookmarked).toBe(false);
  });

  it("responde 500 si falla el DELETE de un bookmark existente", async () => {
    mockState.existingResult = { data: { thread_id: THREAD_ID }, error: null };
    mockState.deleteResult = {
      data: null,
      error: { code: "500", message: "delete failed" },
    };

    const res = await POST(makeRequest({ threadId: THREAD_ID }));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al procesar el guardado");
  });

  it("crea el bookmark cuando no existe y responde bookmarked:true", async () => {
    mockState.existingResult = { data: null, error: null };
    mockState.insertResult = { data: null, error: null };

    const res = await POST(makeRequest({ threadId: THREAD_ID }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.bookmarked).toBe(true);
  });

  it("trata el error 23505 (doble-tap concurrente) como éxito idempotente, no 500", async () => {
    mockState.existingResult = { data: null, error: null };
    mockState.insertResult = {
      data: null,
      error: { code: "23505", message: "duplicate key value" },
    };

    const res = await POST(makeRequest({ threadId: THREAD_ID }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.bookmarked).toBe(true);
  });

  it("responde 500 si falla el INSERT con un error distinto de 23505", async () => {
    mockState.existingResult = { data: null, error: null };
    mockState.insertResult = {
      data: null,
      error: { code: "23503", message: "foreign key violation" },
    };

    const res = await POST(makeRequest({ threadId: THREAD_ID }));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al procesar el guardado");
  });
});
