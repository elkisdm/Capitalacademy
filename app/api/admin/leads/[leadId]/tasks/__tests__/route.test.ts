import { describe, it, expect, vi, beforeEach } from "vitest";

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data: unknown; error?: unknown };

let leadLookup: Result;
let insertResult: Result;
const insertSpy = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "leads") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve(leadLookup) }),
          }),
        };
      }
      return {
        insert: (row: unknown) => {
          insertSpy(row);
          return { select: () => ({ single: () => Promise.resolve(insertResult) }) };
        },
      };
    },
  })),
}));

import { POST } from "../route";

const LEAD = "22222222-2222-2222-2222-222222222222";

function req(body: unknown) {
  return new Request("http://x", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ctx = (leadId = LEAD) => ({ params: Promise.resolve({ leadId }) });

beforeEach(() => {
  authResult = { user: { id: "actor-1" } };
  leadLookup = { data: { id: LEAD }, error: null };
  insertResult = { data: { id: "t-1" }, error: null };
  insertSpy.mockClear();
});

describe("POST /api/admin/leads/[leadId]/tasks", () => {
  it("agenda la tarea con su autor", async () => {
    const res = await POST(
      req({ title: "Llamar a Carol", due_at: "2026-08-27T13:00:00Z" }),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(insertSpy).toHaveBeenCalledWith({
      lead_id: LEAD,
      title: "Llamar a Carol",
      due_at: "2026-08-27T13:00:00.000Z",
      created_by: "actor-1",
    });
  });

  it("normaliza la fecha a ISO en UTC", async () => {
    await POST(req({ title: "x", due_at: "2026-08-27T09:00:00-04:00" }), ctx());
    expect(insertSpy.mock.calls[0][0]).toMatchObject({
      due_at: "2026-08-27T13:00:00.000Z",
    });
  });

  it("recorta el título", async () => {
    await POST(req({ title: "  Llamar  ", due_at: "2026-08-27T13:00:00Z" }), ctx());
    expect(insertSpy.mock.calls[0][0]).toMatchObject({ title: "Llamar" });
  });

  it("acepta agendar en el pasado: nace vencida a propósito", async () => {
    const res = await POST(
      req({ title: "Se me pasó ayer", due_at: "2020-01-01T13:00:00Z" }),
      ctx(),
    );
    expect(res.status).toBe(201);
  });

  it("rechaza un título vacío", async () => {
    const res = await POST(req({ title: "   ", due_at: "2026-08-27T13:00:00Z" }), ctx());
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "La tarea necesita un título" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rechaza un título desmedido", async () => {
    const res = await POST(
      req({ title: "x".repeat(201), due_at: "2026-08-27T13:00:00Z" }),
      ctx(),
    );
    expect(res.status).toBe(422);
  });

  it("rechaza una fecha ilegible", async () => {
    const res = await POST(req({ title: "x", due_at: "mañana" }), ctx());
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "La fecha no es válida" });
  });

  it("rechaza una tarea sin fecha", async () => {
    const res = await POST(req({ title: "x" }), ctx());
    expect(res.status).toBe(422);
  });

  it("rechaza a quien no es staff", async () => {
    authResult = { error: new Response(null, { status: 403 }) };
    const res = await POST(req({ title: "x", due_at: "2026-08-27T13:00:00Z" }), ctx());
    expect(res.status).toBe(403);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rechaza un id de lead que no es uuid", async () => {
    const res = await POST(
      req({ title: "x", due_at: "2026-08-27T13:00:00Z" }),
      ctx("no-soy-uuid"),
    );
    expect(res.status).toBe(400);
  });

  it("rechaza un body que no es JSON", async () => {
    const res = await POST(req("{no json"), ctx());
    expect(res.status).toBe(400);
  });

  it("responde 500 si la lectura del lead falla, no un 404 mentiroso", async () => {
    // Tragar el error convertiría un fallo pasajero de la base en "el lead no
    // existe", que es lo que quien está trabajando leería en pantalla.
    leadLookup = { data: null, error: { message: "boom" } };
    const res = await POST(req({ title: "x", due_at: "2026-08-27T13:00:00Z" }), ctx());
    expect(res.status).toBe(500);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 404 si el lead no existe", async () => {
    leadLookup = { data: null, error: null };
    const res = await POST(req({ title: "x", due_at: "2026-08-27T13:00:00Z" }), ctx());
    expect(res.status).toBe(404);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 500 si el insert falla", async () => {
    insertResult = { data: null, error: { message: "boom" } };
    const res = await POST(req({ title: "x", due_at: "2026-08-27T13:00:00Z" }), ctx());
    expect(res.status).toBe(500);
  });
});
