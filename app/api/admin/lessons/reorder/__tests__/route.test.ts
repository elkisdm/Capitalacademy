import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));

let rpcError: unknown = null;
const mockRpc = vi.fn(() => Promise.resolve({ data: null, error: rpcError }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ rpc: mockRpc })),
}));

const { POST } = await import("@/app/api/admin/lessons/reorder/route");

const MODULE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const L1 = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";
const L2 = "aaaaaaaa-bbbb-4ccc-8ddd-333333333333";

function req(body: unknown) {
  return new Request("http://x/api/admin/lessons/reorder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcError = null;
});

describe("POST /api/admin/lessons/reorder", () => {
  it("422 cuando falta moduleId", async () => {
    const res = await POST(req({ orderedIds: [L1, L2] }));
    expect(res!.status).toBe(422);
  });

  it("422 cuando orderedIds está vacío", async () => {
    const res = await POST(req({ moduleId: MODULE_ID, orderedIds: [] }));
    expect(res!.status).toBe(422);
  });

  it("200 y llama al RPC con el orden recibido", async () => {
    const res = await POST(req({ moduleId: MODULE_ID, orderedIds: [L2, L1] }));
    expect(res!.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("reorder_lessons", {
      p_module_id: MODULE_ID,
      p_ordered_ids: [L2, L1],
    });
  });

  it("500 cuando el RPC falla", async () => {
    rpcError = { message: "boom" };
    const res = await POST(req({ moduleId: MODULE_ID, orderedIds: [L1, L2] }));
    expect(res!.status).toBe(500);
  });
});
