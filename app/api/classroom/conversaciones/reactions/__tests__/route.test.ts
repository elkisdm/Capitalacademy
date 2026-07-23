import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const THREAD_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";
const COMMENT_ID = "c1c2c3d4-e5f6-7890-abcd-ef1234567891";
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

  it("responde 401 si no hay usuario autenticado", async () => {
    mockState.user = null;

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, emoji: "❤️" }),
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
  });

  it("responde 429 cuando el rate limiter rechaza la solicitud", async () => {
    mockCheck.mockReturnValue({ ok: false, remaining: 0, resetAt: Date.now() + 60_000 });

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, emoji: "❤️" }),
    );

    expect(res.status).toBe(429);
  });

  it("responde 400 si el body no es JSON válido", async () => {
    const req = new Request(
      "http://localhost/api/classroom/conversaciones/reactions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{esto no es json",
      },
    );

    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Body invalido");
  });

  it("responde 422 si no se envía threadId ni commentId", async () => {
    const res = await POST(makeRequest("POST", { emoji: "❤️" }));

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
  });

  it("responde 422 si se envían threadId y commentId juntos", async () => {
    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, commentId: COMMENT_ID, emoji: "❤️" }),
    );

    expect(res.status).toBe(422);
  });

  it("responde 422 si el emoji no está en la lista permitida", async () => {
    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, emoji: "🤡" }),
    );

    expect(res.status).toBe(422);
  });

  it("responde 500 si falla el lookup de la reacción existente", async () => {
    mockState.existingResult = {
      data: null,
      error: { message: "db down" },
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, emoji: "❤️" }),
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al procesar la reacción");
  });

  it("quita la reacción (toggle off) cuando el emoji enviado coincide con el existente", async () => {
    mockState.existingResult = {
      data: { id: "existing-1", emoji: "❤️" },
      error: null,
    };
    mockState.aggregateResult = { data: [], error: null };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, emoji: "❤️" }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reactions).toEqual([]);
    expect(json.viewer_reaction).toBeNull();
  });

  it("responde 500 si falla el DELETE al quitar la reacción", async () => {
    mockState.existingResult = {
      data: { id: "existing-1", emoji: "❤️" },
      error: null,
    };
    mockState.aggregateResult = {
      data: null,
      error: { message: "delete failed" },
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, emoji: "❤️" }),
    );

    expect(res.status).toBe(500);
  });

  it("cambia la reacción existente cuando el emoji enviado es distinto", async () => {
    mockState.existingResult = {
      data: { id: "existing-1", emoji: "👍" },
      error: null,
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

  it("responde 500 si falla el UPDATE al cambiar la reacción", async () => {
    mockState.existingResult = {
      data: { id: "existing-1", emoji: "👍" },
      error: null,
    };
    mockState.aggregateResult = {
      data: null,
      error: { message: "update failed" },
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, emoji: "❤️" }),
    );

    expect(res.status).toBe(500);
  });

  it("inserta una reacción nueva cuando no existía ninguna previa", async () => {
    mockState.existingResult = { data: null, error: null };
    mockState.insertResult = { data: null, error: null };
    mockState.aggregateResult = {
      data: [{ emoji: "🎉", user_id: FAKE_USER.id }],
      error: null,
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, emoji: "🎉" }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reactions).toEqual([{ emoji: "🎉", count: 1 }]);
    expect(json.viewer_reaction).toBe("🎉");
  });

  it("responde 500 si el INSERT falla con un error distinto a 23505", async () => {
    mockState.existingResult = { data: null, error: null };
    mockState.insertResult = {
      data: null,
      error: { code: "99999", message: "boom" },
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, emoji: "🎉" }),
    );

    expect(res.status).toBe(500);
  });

  it("acepta reaccionar sobre un comentario (commentId) en vez de un thread", async () => {
    mockState.existingResult = { data: null, error: null };
    mockState.insertResult = { data: null, error: null };
    mockState.aggregateResult = {
      data: [{ emoji: "💡", user_id: FAKE_USER.id }],
      error: null,
    };

    const res = await POST(
      makeRequest("POST", { commentId: COMMENT_ID, emoji: "💡" }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reactions).toEqual([{ emoji: "💡", count: 1 }]);
    expect(json.viewer_reaction).toBe("💡");
  });

  it("devuelve reactions vacías y viewer_reaction null cuando el select agregado no trae filas (data null)", async () => {
    mockState.existingResult = { data: null, error: null };
    mockState.insertResult = { data: null, error: null };
    mockState.aggregateResult = { data: null, error: null };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, emoji: "🎉" }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reactions).toEqual([]);
    expect(json.viewer_reaction).toBeNull();
  });

  it("viewer_reaction queda null cuando existen reacciones de otros usuarios pero no del viewer", async () => {
    mockState.existingResult = { data: null, error: null };
    mockState.insertResult = { data: null, error: null };
    mockState.aggregateResult = {
      data: [{ emoji: "❤️", user_id: "otro-usuario" }],
      error: null,
    };

    const res = await POST(
      makeRequest("POST", { threadId: THREAD_ID, emoji: "❤️" }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reactions).toEqual([{ emoji: "❤️", count: 1 }]);
    expect(json.viewer_reaction).toBeNull();
  });
});
