import { describe, it, expect, vi, beforeEach } from "vitest";

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data: unknown; error?: unknown };

let leadLookup: Result;
let rpcResult: Result;
const rpcSpy = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve(leadLookup) }),
      }),
    }),
    rpc: (name: string, args: unknown) => {
      rpcSpy(name, args);
      return Promise.resolve(rpcResult);
    },
  })),
}));

import { PATCH } from "../route";

const LEAD = "22222222-2222-2222-2222-222222222222";

function req(body: unknown) {
  return new Request("http://x/api/admin/leads/x", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ctx = (leadId = LEAD) => ({ params: Promise.resolve({ leadId }) });

beforeEach(() => {
  authResult = { user: { id: "actor-1" } };
  leadLookup = { data: { stage: "nuevo" }, error: null };
  rpcResult = { data: "nuevo", error: null };
  rpcSpy.mockClear();
});

describe("PATCH /api/admin/leads/[leadId]", () => {
  it("mueve la etapa y devuelve la anterior", async () => {
    const res = await PATCH(req({ stage: "contactado" }), ctx());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      stage: "contactado",
      previous_stage: "nuevo",
    });
  });

  it("delega el cambio y la bitácora a mover_etapa_lead en una sola llamada", async () => {
    await PATCH(req({ stage: "contactado" }), ctx());
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith("mover_etapa_lead", {
      p_lead_id: LEAD,
      p_stage: "contactado",
      p_actor: "actor-1",
      p_detalle: "Nuevo → Contactado",
    });
  });

  it("una etapa cruda en la base no rompe el detalle de la bitácora", async () => {
    leadLookup = { data: { stage: "zombie" }, error: null };
    await PATCH(req({ stage: "contactado" }), ctx());
    expect(rpcSpy.mock.calls[0][1]).toMatchObject({
      p_detalle: "Nuevo → Contactado",
    });
  });

  it("rechaza a quien no es staff", async () => {
    authResult = { error: new Response(null, { status: 403 }) };
    const res = await PATCH(req({ stage: "contactado" }), ctx());
    expect(res.status).toBe(403);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("rechaza un id de lead que no es uuid", async () => {
    const res = await PATCH(req({ stage: "contactado" }), ctx("no-soy-uuid"));
    expect(res.status).toBe(400);
  });

  it("rechaza un body que no es JSON", async () => {
    const res = await PATCH(req("{no json"), ctx());
    expect(res.status).toBe(400);
  });

  it("rechaza una etapa fuera de la lista", async () => {
    const res = await PATCH(req({ stage: "zombie" }), ctx());
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "Etapa inválida" });
  });

  it("rechaza un body sin etapa", async () => {
    const res = await PATCH(req({}), ctx());
    expect(res.status).toBe(422);
  });

  it("responde 500 si la lectura del lead falla", async () => {
    leadLookup = { data: null, error: { message: "boom" } };
    const res = await PATCH(req({ stage: "contactado" }), ctx());
    expect(res.status).toBe(500);
  });

  it("responde 404 si el lead no existe", async () => {
    leadLookup = { data: null, error: null };
    const res = await PATCH(req({ stage: "contactado" }), ctx());
    expect(res.status).toBe(404);
  });

  it("responde 500 si la función de la base falla", async () => {
    rpcResult = { data: null, error: { message: "boom" } };
    const res = await PATCH(req({ stage: "contactado" }), ctx());
    expect(res.status).toBe(500);
  });

  it("responde 404 si el lead desaparece entre la lectura y el movimiento", async () => {
    rpcResult = { data: null, error: null };
    const res = await PATCH(req({ stage: "contactado" }), ctx());
    expect(res.status).toBe(404);
  });
});
