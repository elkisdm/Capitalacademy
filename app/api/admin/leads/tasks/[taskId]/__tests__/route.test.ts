import { describe, it, expect, vi, beforeEach } from "vitest";

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data: unknown; error?: unknown };

let updateResult: Result;
let deleteResult: Result;
const updateSpy = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({
      update: (patch: unknown) => {
        updateSpy(patch);
        return {
          eq: () => ({
            select: () => ({ maybeSingle: () => Promise.resolve(updateResult) }),
          }),
        };
      },
      delete: () => ({
        eq: () => ({
          select: () => ({ maybeSingle: () => Promise.resolve(deleteResult) }),
        }),
      }),
    }),
  })),
}));

import { PATCH, DELETE } from "../route";

const TASK = "44444444-4444-4444-4444-444444444444";

function req(body: unknown) {
  return new Request("http://x", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ctx = (taskId = TASK) => ({ params: Promise.resolve({ taskId }) });

beforeEach(() => {
  authResult = { user: { id: "actor-1" } };
  updateResult = { data: { id: TASK }, error: null };
  deleteResult = { data: { id: TASK }, error: null };
  updateSpy.mockClear();
});

describe("PATCH /api/admin/leads/tasks/[taskId]", () => {
  it("marca la tarea como hecha con la hora del cierre", async () => {
    const res = await PATCH(req({ done: true }), ctx());
    expect(res.status).toBe(200);
    const patch = updateSpy.mock.calls[0][0] as { done_at: string | null };
    expect(patch.done_at).toBeTypeOf("string");
    expect(Number.isNaN(new Date(patch.done_at as string).getTime())).toBe(false);
  });

  it("reabre la tarea dejando done_at en null", async () => {
    await PATCH(req({ done: false }), ctx());
    expect(updateSpy).toHaveBeenCalledWith({ done_at: null });
  });

  it("rechaza a quien no es staff", async () => {
    authResult = { error: new Response(null, { status: 403 }) };
    const res = await PATCH(req({ done: true }), ctx());
    expect(res.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("rechaza un id que no es uuid", async () => {
    const res = await PATCH(req({ done: true }), ctx("no-soy-uuid"));
    expect(res.status).toBe(400);
  });

  it("rechaza un body que no es JSON", async () => {
    const res = await PATCH(req("{no json"), ctx());
    expect(res.status).toBe(400);
  });

  it("rechaza un body sin 'done'", async () => {
    const res = await PATCH(req({}), ctx());
    expect(res.status).toBe(422);
  });

  it("responde 500 si el update falla", async () => {
    updateResult = { data: null, error: { message: "boom" } };
    const res = await PATCH(req({ done: true }), ctx());
    expect(res.status).toBe(500);
  });

  it("responde 404 si la tarea no existe", async () => {
    updateResult = { data: null, error: null };
    const res = await PATCH(req({ done: true }), ctx());
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/leads/tasks/[taskId]", () => {
  const del = () => new Request("http://x", { method: "DELETE" });

  it("borra la tarea", async () => {
    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("rechaza a quien no es staff", async () => {
    authResult = { error: new Response(null, { status: 403 }) };
    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(403);
  });

  it("rechaza un id que no es uuid", async () => {
    const res = await DELETE(del(), ctx("no-soy-uuid"));
    expect(res.status).toBe(400);
  });

  it("responde 500 si el borrado falla", async () => {
    deleteResult = { data: null, error: { message: "boom" } };
    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(500);
  });

  it("responde 404 en vez de fingir que borró algo inexistente", async () => {
    deleteResult = { data: null, error: null };
    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(404);
  });
});
