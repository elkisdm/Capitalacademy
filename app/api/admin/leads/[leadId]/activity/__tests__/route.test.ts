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
          return {
            select: () => ({ single: () => Promise.resolve(insertResult) }),
          };
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
  insertResult = { data: { id: "a-1" }, error: null };
  insertSpy.mockClear();
});

describe("POST /api/admin/leads/[leadId]/activity", () => {
  it("registra una nota", async () => {
    const res = await POST(req({ kind: "note", body: "Pidió llamar el lunes" }), ctx());
    expect(res.status).toBe(201);
    expect(insertSpy).toHaveBeenCalledWith({
      lead_id: LEAD,
      kind: "note",
      outcome: null,
      body: "Pidió llamar el lunes",
      created_by: "actor-1",
    });
  });

  it("registra una llamada con su resultado", async () => {
    const res = await POST(req({ kind: "call", outcome: "no_answer" }), ctx());
    expect(res.status).toBe(201);
    expect(insertSpy.mock.calls[0][0]).toMatchObject({
      kind: "call",
      outcome: "no_answer",
      body: null,
    });
  });

  it("registra un WhatsApp sin cuerpo", async () => {
    const res = await POST(req({ kind: "whatsapp" }), ctx());
    expect(res.status).toBe(201);
    expect(insertSpy.mock.calls[0][0]).toMatchObject({ kind: "whatsapp", body: null });
  });

  it("registra un correo", async () => {
    const res = await POST(req({ kind: "email" }), ctx());
    expect(res.status).toBe(201);
  });

  it("guarda el cuerpo sin espacios de sobra", async () => {
    await POST(req({ kind: "note", body: "  con espacios  " }), ctx());
    expect(insertSpy.mock.calls[0][0]).toMatchObject({ body: "con espacios" });
  });

  it("no deja escribir un cambio de etapa a mano", async () => {
    const res = await POST(req({ kind: "stage_change", body: "x" }), ctx());
    expect(res.status).toBe(422);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rechaza un resultado en algo que no es una llamada", async () => {
    const res = await POST(req({ kind: "email", outcome: "answered" }), ctx());
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({
      error: "El resultado solo aplica a una llamada",
    });
  });

  it("rechaza un resultado de llamada fuera de la lista", async () => {
    const res = await POST(req({ kind: "call", outcome: "quizas" }), ctx());
    expect(res.status).toBe(422);
  });

  it("rechaza una nota vacía", async () => {
    const res = await POST(req({ kind: "note", body: "   " }), ctx());
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "La nota no puede ir vacía" });
  });

  it("rechaza una nota sin cuerpo", async () => {
    const res = await POST(req({ kind: "note" }), ctx());
    expect(res.status).toBe(422);
  });

  it("rechaza un cuerpo desmedido", async () => {
    const res = await POST(req({ kind: "note", body: "x".repeat(2001) }), ctx());
    expect(res.status).toBe(422);
  });

  it("rechaza a quien no es staff", async () => {
    authResult = { error: new Response(null, { status: 403 }) };
    const res = await POST(req({ kind: "email" }), ctx());
    expect(res.status).toBe(403);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rechaza un id de lead que no es uuid", async () => {
    const res = await POST(req({ kind: "email" }), ctx("no-soy-uuid"));
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
    const res = await POST(req({ kind: "email" }), ctx());
    expect(res.status).toBe(500);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 404 si el lead no existe", async () => {
    leadLookup = { data: null, error: null };
    const res = await POST(req({ kind: "email" }), ctx());
    expect(res.status).toBe(404);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 500 si el insert falla", async () => {
    insertResult = { data: null, error: { message: "boom" } };
    const res = await POST(req({ kind: "email" }), ctx());
    expect(res.status).toBe(500);
  });
});
