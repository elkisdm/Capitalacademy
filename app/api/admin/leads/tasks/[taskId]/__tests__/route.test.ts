import { describe, it, expect, vi, beforeEach } from "vitest";

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data: unknown; error?: unknown };

let updateResult: Result;
let deleteResult: Result;
const updateSpy = vi.fn();

let cancelarImpl: (id: string) => Promise<boolean>;
const cancelarSpy = vi.fn();
vi.mock("@/lib/atlas/calendario", () => ({
  cancelarReunion: vi.fn((id: string) => {
    cancelarSpy(id);
    return cancelarImpl(id);
  }),
}));

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
  deleteResult = { data: { id: TASK, google_event_id: null }, error: null };
  cancelarImpl = async () => true;
  updateSpy.mockClear();
  cancelarSpy.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
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


describe("borrar una reunión limpia el calendario de la profesora", () => {
  const del = () => new Request("http://x", { method: "DELETE" });

  it("un recordatorio interno no llama a Google", async () => {
    deleteResult = { data: { id: TASK, google_event_id: null }, error: null };
    await DELETE(del(), ctx());
    expect(cancelarSpy).not.toHaveBeenCalled();
  });

  it("una reunión cancela su evento", async () => {
    deleteResult = { data: { id: TASK, google_event_id: "abc12" }, error: null };
    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(200);
    expect(cancelarSpy).toHaveBeenCalledWith("abc12");
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("un evento que ya no estaba en Google no es error", async () => {
    deleteResult = { data: { id: TASK, google_event_id: "abc12" }, error: null };
    cancelarImpl = async () => false;
    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("si la cancelación falla NO se resucita la fila, pero se avisa", async () => {
    // La tarea ya se borró: revertir es imposible y fingir éxito dejaría un
    // evento fantasma en la agenda sin que nadie lo sepa.
    deleteResult = { data: { id: TASK, google_event_id: "abc12" }, error: null };
    cancelarImpl = async () => { throw new Error("Atlas caído"); };
    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      warning: "La reunión se borró acá pero sigue en el calendario de Google.",
    });
  });

  it("un fallo que no es Error tampoco rompe el log", async () => {
    deleteResult = { data: { id: TASK, google_event_id: "abc12" }, error: null };
    cancelarImpl = async () => { throw "texto suelto"; };
    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(expect.any(String), "texto suelto");
  });

  it("el evento huérfano queda registrado para revisarlo a mano", async () => {
    deleteResult = { data: { id: TASK, google_event_id: "abc12" }, error: null };
    cancelarImpl = async () => { throw new Error("Atlas caído"); };
    await DELETE(del(), ctx());
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("abc12"),
      expect.anything(),
    );
  });
});
