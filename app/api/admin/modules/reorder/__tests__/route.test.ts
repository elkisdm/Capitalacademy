import { describe, it, expect, vi, beforeEach } from "vitest";

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

let rpcError: unknown = null;
const mockRpc = vi.fn(() => Promise.resolve({ data: null, error: rpcError }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ rpc: mockRpc })),
}));

const { POST } = await import("@/app/api/admin/modules/reorder/route");

const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const M1 = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";
const M2 = "aaaaaaaa-bbbb-4ccc-8ddd-333333333333";

function req(body: unknown) {
  return new Request("http://x/api/admin/modules/reorder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authResult = { user: { id: "admin-1" } };
  rpcError = null;
});

describe("POST /api/admin/modules/reorder", () => {
  it("devuelve el error de authorizeAdmin sin tocar la base", async () => {
    const denied = new Response(null, { status: 403 });
    authResult = { error: denied };
    const res = await POST(req({ programId: PROGRAM_ID, orderedIds: [M1] }));
    expect(res).toBe(denied);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("400 con JSON malformado", async () => {
    const res = await POST(req("{no-es-json"));
    expect(res.status).toBe(400);
  });

  it("422 cuando falta programId", async () => {
    const res = await POST(req({ orderedIds: [M1, M2] }));
    expect(res.status).toBe(422);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("422 cuando orderedIds está vacío", async () => {
    const res = await POST(req({ programId: PROGRAM_ID, orderedIds: [] }));
    expect(res.status).toBe(422);
  });

  it("422 cuando un módulo viene repetido", async () => {
    // Con un id repetido el RPC asigna dos posiciones a la misma fila y deja
    // otra en el offset: mejor rechazarlo antes de tocar la base.
    const res = await POST(req({ programId: PROGRAM_ID, orderedIds: [M1, M1] }));
    expect(res.status).toBe(422);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("200 y llama al RPC con el orden recibido", async () => {
    const res = await POST(req({ programId: PROGRAM_ID, orderedIds: [M2, M1] }));
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("reorder_modules", {
      p_program_id: PROGRAM_ID,
      p_ordered_ids: [M2, M1],
    });
  });

  it("422 legible cuando la lista llega incompleta (la excepción del RPC)", async () => {
    rpcError = {
      // Mensaje real del RPC, con el conteo que agrega el guardia.
      message:
        'reorder_modules: p_ordered_ids debe incluir todos los módulos del programa (4 de 6)',
    };
    const res = await POST(req({ programId: PROGRAM_ID, orderedIds: [M1] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("Faltan módulos en el orden enviado");
  });

  it("500 ante cualquier otro fallo del RPC", async () => {
    rpcError = { message: "deadlock detected" };
    const res = await POST(req({ programId: PROGRAM_ID, orderedIds: [M1, M2] }));
    expect(res.status).toBe(500);
  });
});
