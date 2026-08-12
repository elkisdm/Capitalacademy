import { describe, it, expect, vi, beforeEach } from "vitest";
import { fichaVacia } from "@/lib/evaluacion/ficha";

// ── Helpers ──────────────────────────────────────────────────

const FAKE_USER = { id: "u-11111111-1111-1111-1111-111111111111" };
const ENTRY_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";

const FICHA = {
  ...fichaVacia(),
  nombre: "Ana Pérez",
  anioNacimiento: 1988,
  sueldos: [2_800_000, 2_800_000, 2_800_000],
};

const PAYLOAD = {
  nombre: "Ana Pérez",
  valorUF: 39_400,
  ficha: FICHA,
  evaluacion: { califica: true, rentaFinal: 2_800_000 },
};

const FILA = {
  id: ENTRY_ID,
  nombre: "Ana Pérez",
  valor_uf: 39_400,
  ficha: FICHA,
  evaluacion: PAYLOAD.evaluacion,
  created_at: "2026-08-12T20:00:00Z",
};

function postRequest(body?: unknown) {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/classroom/evaluaciones/historial", init);
}

function deleteRequest(id: string | null) {
  const url = new URL("http://localhost/api/classroom/evaluaciones/historial");
  if (id !== null) url.searchParams.set("id", id);
  return new Request(url, { method: "DELETE" });
}

// ── Mutable mock state ───────────────────────────────────────
// El endpoint hace: select (lista / sobrantes), insert…single, delete.

const mockState = {
  user: FAKE_USER as { id: string } | null,
  selectResult: { data: [] as unknown, error: null as unknown },
  insertResult: { data: FILA as unknown, error: null as unknown },
  deleteResult: { data: null as unknown, error: null as unknown },
};

const mockCheck = vi.fn();
const inserts: unknown[] = [];

function createQueryBuilder() {
  let lastOp: "select" | "insert" | "delete" = "select";
  const make = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => {
              if (lastOp === "delete") return resolve(mockState.deleteResult);
              return resolve(mockState.selectResult);
            };
          }
          if (prop === "single") {
            return () => Promise.resolve(mockState.insertResult);
          }
          if (prop === "insert") {
            lastOp = "insert";
            return (payload: unknown) => {
              inserts.push(payload);
              return make();
            };
          }
          if (prop === "delete") {
            lastOp = "delete";
            return (..._args: unknown[]) => make();
          }
          if (["select", "eq", "in", "order", "limit", "range"].includes(prop)) {
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

// ── Import handlers (AFTER mocks) ─────────────────────────────

const { GET, POST, DELETE } = await import(
  "@/app/api/classroom/evaluaciones/historial/route"
);

beforeEach(() => {
  mockState.user = FAKE_USER;
  mockState.selectResult = { data: [], error: null };
  mockState.insertResult = { data: FILA, error: null };
  mockState.deleteResult = { data: null, error: null };
  inserts.length = 0;
  mockCheck.mockReturnValue({ ok: true, remaining: 29, resetAt: Date.now() + 60_000 });
});

describe("GET /api/classroom/evaluaciones/historial", () => {
  it("responde 401 sin usuario", async () => {
    mockState.user = null;
    expect((await GET()).status).toBe(401);
  });

  it("lista las entradas del usuario", async () => {
    mockState.selectResult = { data: [FILA], error: null };
    const res = await GET();
    expect(res.status).toBe(200);
    const { entradas } = await res.json();
    expect(entradas).toHaveLength(1);
    expect(entradas[0].id).toBe(ENTRY_ID);
  });
});

describe("POST /api/classroom/evaluaciones/historial", () => {
  it("responde 401 sin usuario", async () => {
    mockState.user = null;
    expect((await POST(postRequest(PAYLOAD))).status).toBe(401);
  });

  it("responde 429 cuando el rate limit corta", async () => {
    mockCheck.mockReturnValue({ ok: false, remaining: 0, resetAt: Date.now() });
    expect((await POST(postRequest(PAYLOAD))).status).toBe(429);
  });

  it("guarda con el user_id del viewer y responde 201", async () => {
    const res = await POST(postRequest(PAYLOAD));
    expect(res.status).toBe(201);
    // El user_id sale de la sesión, nunca del body: es lo que la RLS refuerza.
    expect(inserts[0]).toMatchObject({ user_id: FAKE_USER.id, nombre: "Ana Pérez" });
    const { entrada } = await res.json();
    expect(entrada.id).toBe(ENTRY_ID);
  });

  it("rechaza una ficha inválida con 422", async () => {
    const res = await POST(
      postRequest({ ...PAYLOAD, ficha: { ...FICHA, anioNacimiento: 1800 } }),
    );
    expect(res.status).toBe(422);
  });

  it("un nombre vacío queda etiquetado, no vacío", async () => {
    await POST(postRequest({ ...PAYLOAD, nombre: "   " }));
    expect(inserts[0]).toMatchObject({ nombre: "Ficha sin nombre" });
  });

  it("body ilegible responde 400", async () => {
    const req = new Request("http://localhost/api/classroom/evaluaciones/historial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{no es json",
    });
    expect((await POST(req)).status).toBe(400);
  });
});

describe("DELETE /api/classroom/evaluaciones/historial", () => {
  it("responde 401 sin usuario", async () => {
    mockState.user = null;
    expect((await DELETE(deleteRequest(ENTRY_ID))).status).toBe(401);
  });

  it("rechaza un id que no parece uuid", async () => {
    expect((await DELETE(deleteRequest("no-un-uuid"))).status).toBe(422);
  });

  it("elimina y responde ok", async () => {
    const res = await DELETE(deleteRequest(ENTRY_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
