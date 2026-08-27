import { describe, it, expect, vi, beforeEach } from "vitest";

let authResult: { user: { id: string } } | { error: Response };
vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data: unknown; error?: unknown };

let leadLookup: Result;
let insertResult: Result;
let updateResult: Result;
const insertSpy = vi.fn();
const updateSpy = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "leads") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(leadLookup) }) }) };
      }
      return {
        insert: (row: unknown) => {
          insertSpy(row);
          return { select: () => ({ single: () => Promise.resolve(insertResult) }) };
        },
        update: (patch: unknown) => {
          updateSpy(patch);
          return { eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve(updateResult) }) }) };
        },
      };
    },
  })),
}));

let crearImpl: (i: unknown) => Promise<unknown>;
vi.mock("@/lib/atlas/calendario", async () => {
  const actual = await vi.importActual<typeof import("@/lib/atlas/calendario")>(
    "@/lib/atlas/calendario",
  );
  return { ...actual, crearReunion: vi.fn((i: unknown) => crearImpl(i)) };
});

import { POST } from "../route";
import { AtlasCalendarError } from "@/lib/atlas/calendario";

const LEAD = "22222222-2222-2222-2222-222222222222";
const TASK = "6064b11e-556c-4609-be14-9446037e6af7";

const body = (over: Record<string, unknown> = {}) => ({
  title: "Reunión con Ana",
  due_at: "2026-08-27T15:00:00.000Z",
  duration_minutes: 45,
  ...over,
});

const req = (b: unknown) =>
  new Request("http://x", { method: "POST", body: typeof b === "string" ? b : JSON.stringify(b) });
const ctx = (leadId = LEAD) => ({ params: Promise.resolve({ leadId }) });

beforeEach(() => {
  authResult = { user: { id: "actor-1" } };
  leadLookup = { data: { id: LEAD, full_name: "Ana Pérez", email: "ana@example.cl" }, error: null };
  insertResult = { data: { id: TASK, lead_id: LEAD, kind: "meeting" }, error: null };
  updateResult = { data: { id: TASK, kind: "meeting", meet_url: "https://meet.google.com/x" }, error: null };
  crearImpl = async () => ({
    eventId: "abc", meetUrl: "https://meet.google.com/x", htmlLink: "h", yaExistia: false,
  });
  insertSpy.mockClear();
  updateSpy.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/admin/leads/[leadId]/meetings", () => {
  it("guarda la reunión y la agenda", async () => {
    const res = await POST(req(body()), ctx());
    expect(res.status).toBe(201);
    expect(insertSpy.mock.calls[0][0]).toMatchObject({
      lead_id: LEAD, kind: "meeting", duration_minutes: 45, created_by: "actor-1",
    });
    expect(updateSpy.mock.calls[0][0]).toMatchObject({
      google_event_id: "abc", meet_url: "https://meet.google.com/x", sync_error: null,
    });
  });

  it("invita al correo del lead", async () => {
    const { crearReunion } = await import("@/lib/atlas/calendario");
    await POST(req(body()), ctx());
    expect(vi.mocked(crearReunion).mock.calls[0][0]).toMatchObject({
      taskId: TASK, correoInvitado: "ana@example.cl", duracionMinutos: 45,
    });
  });

  it("guarda ANTES de agendar: si Google falla, lo escrito no se pierde", async () => {
    crearImpl = async () => { throw new AtlasCalendarError("Atlas no responde", null); };
    const res = await POST(req(body()), ctx());
    expect(res.status).toBe(201);
    expect(insertSpy).toHaveBeenCalled();
  });

  it("una reunión que no llegó al calendario queda MARCADA, nunca como agendada", async () => {
    crearImpl = async () => { throw new AtlasCalendarError("Atlas no responde", null); };
    const res = await POST(req(body()), ctx());
    expect(updateSpy.mock.calls[0][0].sync_error).toContain("Atlas no responde");
    await expect(res.json()).resolves.toMatchObject({
      warning: "La reunión quedó anotada pero no llegó al calendario.",
    });
  });

  it("un error inesperado tampoco pierde la tarea", async () => {
    crearImpl = async () => { throw new Error("algo raro"); };
    const res = await POST(req(body()), ctx());
    expect(res.status).toBe(201);
    expect(updateSpy.mock.calls[0][0].sync_error).toBeTruthy();
  });

  it("el motivo del fallo se recorta para no reventar la columna", async () => {
    crearImpl = async () => { throw new AtlasCalendarError("x".repeat(900), null); };
    await POST(req(body()), ctx());
    expect(updateSpy.mock.calls[0][0].sync_error.length).toBeLessThanOrEqual(500);
  });

  it("un lead sin correo no se puede agendar: no hay a quién invitar", async () => {
    leadLookup = { data: { id: LEAD, full_name: "Ana", email: null }, error: null };
    const res = await POST(req(body()), ctx());
    expect(res.status).toBe(422);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rechaza a quien no es staff", async () => {
    authResult = { error: new Response(null, { status: 403 }) };
    const res = await POST(req(body()), ctx());
    expect(res.status).toBe(403);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rechaza un id de lead que no es uuid", async () => {
    expect((await POST(req(body()), ctx("no-uuid"))).status).toBe(400);
  });

  it("rechaza un body que no es JSON", async () => {
    expect((await POST(req("{no json"), ctx())).status).toBe(400);
  });

  it.each([
    ["sin título", { title: "   " }],
    ["fecha ilegible", { due_at: "mañana" }],
    ["duración muy corta", { duration_minutes: 1 }],
    ["duración absurda", { duration_minutes: 900 }],
    ["duración no entera", { duration_minutes: 30.5 }],
  ])("rechaza %s", async (_n, over) => {
    const res = await POST(req(body(over)), ctx());
    expect(res.status).toBe(422);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("responde 500 si la lectura del lead falla, no un 404 mentiroso", async () => {
    leadLookup = { data: null, error: { message: "boom" } };
    expect((await POST(req(body()), ctx())).status).toBe(500);
  });

  it("responde 404 si el lead no existe", async () => {
    leadLookup = { data: null, error: null };
    expect((await POST(req(body()), ctx())).status).toBe(404);
  });

  it("responde 500 si no se pudo guardar la tarea", async () => {
    insertResult = { data: null, error: { message: "boom" } };
    const res = await POST(req(body()), ctx());
    expect(res.status).toBe(500);
  });
});


describe("respuestas degradadas", () => {
  it("si el update posterior no devuelve fila, igual responde la tarea creada", async () => {
    // La reunión SÍ se agendó; solo falló la relectura. Devolver 500 aquí haría
    // que el panel creyera que no se agendó nada y se reintentara de más.
    updateResult = { data: null, error: null };
    const res = await POST(req(body()), ctx());
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ id: TASK });
  });

  it("si falla Google Y la relectura, la tarea creada sigue viajando con su aviso", async () => {
    crearImpl = async () => { throw new AtlasCalendarError("caído", null); };
    updateResult = { data: null, error: null };
    const res = await POST(req(body()), ctx());
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      id: TASK,
      warning: "La reunión quedó anotada pero no llegó al calendario.",
    });
  });
});
