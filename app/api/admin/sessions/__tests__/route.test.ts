import { describe, it, expect, vi, beforeEach } from "vitest";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data?: unknown; error?: unknown };

type State = {
  sessionsListResult: Result; // GET: class_sessions select(*).eq(cohort_id).order(starts_at)
  cohortResult: Result; // POST: cohorts select("id, program_id").eq(id).single()
  moduleResult: Result; // POST: program_modules select("program_id").eq(id).single()
  sessionInsertResult: Result; // POST: class_sessions insert(...).select("*").single()
};
let state: State;

const insertCalls: unknown[] = [];

function makeBuilder(table: string) {
  const calls: string[] = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) {
    b[m] = (...args: unknown[]) => {
      calls.push(m);
      return b;
    };
  }
  b.insert = (row: unknown) => {
    calls.push("insert");
    if (table === "class_sessions") insertCalls.push(row);
    return b;
  };

  const hasCall = (m: string) => calls.includes(m);

  const resolve = (): Result => {
    if (table === "class_sessions") {
      if (hasCall("insert")) return state.sessionInsertResult;
      return state.sessionsListResult;
    }
    if (table === "cohorts") return state.cohortResult;
    if (table === "program_modules") return state.moduleResult;
    return { data: null, error: null };
  };

  b.single = () => Promise.resolve(resolve());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeBuilder(table) })),
}));

const { GET, POST } = await import("@/app/api/admin/sessions/route");

const COHORT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-999999999999";
const MODULE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const TEACHER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";

function getReq(cohortId?: string) {
  const url = cohortId
    ? `http://x/api/admin/sessions?cohort_id=${cohortId}`
    : "http://x/api/admin/sessions";
  return new Request(url);
}

function postReq(body: unknown) {
  return new Request("http://x/api/admin/sessions", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validBody = {
  cohort_id: COHORT_ID,
  title: "Clase de prueba",
  starts_at: "2026-08-01T10:00:00.000Z",
  ends_at: "2026-08-01T11:00:00.000Z",
  modality: "live_online",
};

beforeEach(() => {
  vi.clearAllMocks();
  insertCalls.length = 0;
  authResult = { user: { id: "admin-1" } };
  state = {
    sessionsListResult: {
      data: [{ id: "s1", cohort_id: COHORT_ID, starts_at: validBody.starts_at }],
      error: null,
    },
    cohortResult: { data: { id: COHORT_ID, program_id: "program-1" }, error: null },
    moduleResult: { data: { program_id: "program-1" }, error: null },
    sessionInsertResult: {
      data: { id: "new-session", cohort_id: COHORT_ID, title: validBody.title },
      error: null,
    },
  };
});

describe("GET /api/admin/sessions", () => {
  it("devuelve el error de authorizeAdmin cuando deniega", async () => {
    const denied = Response.json({ error: "No autorizado" }, { status: 403 });
    authResult = { error: denied };
    const res = (await GET(getReq(COHORT_ID)))!;
    expect(res).toBe(denied);
  });

  it("422 cuando falta cohort_id", async () => {
    const res = (await GET(getReq()))!;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("cohort_id es requerido y debe ser un UUID válido");
  });

  it("422 cuando cohort_id no tiene formato UUID", async () => {
    const res = (await GET(getReq("no-es-un-uuid")))!;
    expect(res.status).toBe(422);
  });

  it("500 cuando falla la consulta a class_sessions", async () => {
    state.sessionsListResult = { data: null, error: { message: "db down" } };
    const res = (await GET(getReq(COHORT_ID)))!;
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al listar las sesiones");
  });

  it("200 y sessions: [] cuando data es null pero no hay error", async () => {
    state.sessionsListResult = { data: null, error: null };
    const res = (await GET(getReq(COHORT_ID)))!;
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ sessions: [] });
  });

  it("200 con la lista de sesiones del cohorte", async () => {
    const res = (await GET(getReq(COHORT_ID)))!;
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sessions).toEqual(state.sessionsListResult.data);
  });
});

describe("POST /api/admin/sessions", () => {
  it("devuelve el error de authorizeAdmin cuando deniega", async () => {
    const denied = Response.json({ error: "No autenticado" }, { status: 401 });
    authResult = { error: denied };
    const res = (await POST(postReq(validBody)))!;
    expect(res).toBe(denied);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const res = (await POST(postReq("{esto no es json")))!;
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Body inválido");
  });

  it("422 cuando faltan campos obligatorios", async () => {
    const res = (await POST(postReq({ title: "Sin cohorte ni fechas" })))!;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
    expect(Array.isArray(json.issues)).toBe(true);
  });

  it("422 cuando modality no está en el enum", async () => {
    const res = (await POST(postReq({ ...validBody, modality: "presencial" })))!;
    expect(res.status).toBe(422);
  });

  it("422 cuando meeting_url no es una URL válida", async () => {
    const res = (await POST(postReq({ ...validBody, meeting_url: "no-es-url" })))!;
    expect(res.status).toBe(422);
  });

  it("422 cuando starts_at/ends_at no son datetime ISO con offset", async () => {
    const res = (await POST(postReq({ ...validBody, starts_at: "2026-08-01" })))!;
    expect(res.status).toBe(422);
  });

  it("422 cuando ends_at es igual a starts_at", async () => {
    const res = (await POST(
      postReq({ ...validBody, ends_at: validBody.starts_at }),
    ))!;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("La hora de término debe ser posterior al inicio");
  });

  it("422 cuando ends_at es anterior a starts_at", async () => {
    const res = (await POST(
      postReq({
        ...validBody,
        starts_at: "2026-08-01T11:00:00.000Z",
        ends_at: "2026-08-01T10:00:00.000Z",
      }),
    ))!;
    expect(res.status).toBe(422);
  });

  it("404 cuando la cohorte no existe", async () => {
    state.cohortResult = { data: null, error: null };
    const res = (await POST(postReq(validBody)))!;
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Cohorte no encontrada");
  });

  it("422 cuando el módulo asignado no existe", async () => {
    state.moduleResult = { data: null, error: null };
    const res = (await POST(postReq({ ...validBody, module_id: MODULE_ID })))!;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("El módulo seleccionado no existe");
  });

  it("422 cuando el módulo asignado pertenece a otro programa", async () => {
    state.moduleResult = { data: { program_id: "otro-programa" }, error: null };
    const res = (await POST(postReq({ ...validBody, module_id: MODULE_ID })))!;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("El módulo no pertenece al programa de la cohorte");
  });

  it("500 cuando falla el insert en class_sessions", async () => {
    state.sessionInsertResult = { data: null, error: { message: "boom" } };
    const res = (await POST(postReq(validBody)))!;
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al crear la sesión");
  });

  it("201 y crea la sesión con los defaults (audience: all, status: scheduled, sin invitados, sin módulo)", async () => {
    const res = (await POST(postReq(validBody)))!;
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.session).toEqual(state.sessionInsertResult.data);
    expect(insertCalls[0]).toEqual({
      cohort_id: COHORT_ID,
      title: validBody.title,
      starts_at: validBody.starts_at,
      ends_at: validBody.ends_at,
      modality: validBody.modality,
      teacher_id: null,
      module_id: null,
      meeting_url: null,
      audience: "all",
      status: "scheduled",
      // Sala cerrada a invitados sin cuenta salvo que se pida lo contrario
      // (0099): abrirla es un acto deliberado, nunca un default.
      guest_access: false,
      created_by: "admin-1",
    });
  });

  it("201 y crea la sesión con módulo, docente, meeting_url y overrides de audience/status", async () => {
    const res = (await POST(
      postReq({
        ...validBody,
        module_id: MODULE_ID,
        teacher_id: TEACHER_ID,
        meeting_url: "https://meet.example.com/clase",
        audience: "capital_inteligente",
        status: "in_progress",
      }),
    ))!;
    expect(res.status).toBe(201);
    expect(insertCalls[0]).toMatchObject({
      module_id: MODULE_ID,
      teacher_id: TEACHER_ID,
      meeting_url: "https://meet.example.com/clase",
      audience: "capital_inteligente",
      status: "in_progress",
    });
  });
});
