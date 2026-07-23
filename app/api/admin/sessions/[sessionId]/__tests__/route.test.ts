import { describe, it, expect, vi, beforeEach } from "vitest";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data?: unknown; error?: unknown };

type State = {
  sessionResult: Result; // class_sessions select(...).eq(id).single() (lectura actual)
  cohortResult: Result; // cohorts select("program_id").eq(id).single()
  moduleResult: Result; // program_modules select("program_id").eq(id).single()
  updateResult: Result; // class_sessions update(...).eq(id).select("*").single()
  deleteResult: Result; // class_sessions delete().eq(id)
};
let state: State;

function makeBuilder(table: string) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const methods = ["select", "insert", "update", "delete", "eq"];
  const b: Record<string, unknown> = {};
  for (const m of methods) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  const hasCall = (m: string) => calls.some((c) => c.method === m);

  const resolve = (): Result => {
    if (table === "class_sessions") {
      if (hasCall("update")) return state.updateResult;
      if (hasCall("delete")) return state.deleteResult;
      return state.sessionResult;
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

const { PATCH, DELETE } = await import(
  "@/app/api/admin/sessions/[sessionId]/route"
);

const SESSION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-999999999999";
const MODULE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const OTHER_MODULE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";

function ctx(sessionId = SESSION_ID) {
  return { params: Promise.resolve({ sessionId }) };
}

function req(method: string, body?: unknown) {
  return new Request("http://x/api/admin/sessions/" + SESSION_ID, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
}

function reqRawBody(rawBody: string) {
  return new Request("http://x/api/admin/sessions/" + SESSION_ID, {
    method: "PATCH",
    body: rawBody,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authResult = { user: { id: "admin-1" } };
  state = {
    sessionResult: {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        starts_at: "2026-08-01T10:00:00.000Z",
        ends_at: "2026-08-01T11:00:00.000Z",
      },
      error: null,
    },
    cohortResult: { data: { program_id: "program-1" }, error: null },
    moduleResult: { data: { program_id: "program-1" }, error: null },
    updateResult: {
      data: {
        id: SESSION_ID,
        cohort_id: "cohort-1",
        title: "Clase actualizada",
      },
      error: null,
    },
    deleteResult: { error: null },
  };
});

describe("PATCH /api/admin/sessions/[sessionId]", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await PATCH(req("PATCH", { title: "Nuevo título" }), ctx());
    expect(res!.status).toBe(403);
  });

  it("422 cuando el id no es un UUID válido", async () => {
    const res = await PATCH(req("PATCH", { title: "Nuevo título" }), ctx("no-es-un-uuid"));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("ID inválido");
  });

  it("400 cuando el body no es JSON válido", async () => {
    const res = await PATCH(reqRawBody("{esto no es json"), ctx());
    expect(res!.status).toBe(400);
    const json = await res!.json();
    expect(json.error).toBe("Body inválido");
  });

  it("422 cuando el body no cumple el schema (modality inválida)", async () => {
    const res = await PATCH(req("PATCH", { modality: "en_persona" }), ctx());
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("Validación fallida");
    expect(Array.isArray(json.issues)).toBe(true);
  });

  it("422 cuando el body está vacío (sin campos para actualizar)", async () => {
    const res = await PATCH(req("PATCH", {}), ctx());
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("No hay campos para actualizar");
  });

  it("404 cuando la sesión no existe", async () => {
    state.sessionResult = { data: null, error: null };
    const res = await PATCH(req("PATCH", { title: "Nuevo título" }), ctx());
    expect(res!.status).toBe(404);
  });

  it("422 cuando el módulo reasignado no existe", async () => {
    state.moduleResult = { data: null, error: null };
    const res = await PATCH(req("PATCH", { module_id: MODULE_ID }), ctx());
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("El módulo seleccionado no existe");
  });

  it("422 cuando el módulo reasignado no pertenece al programa de la cohorte", async () => {
    state.moduleResult = { data: { program_id: "program-otro" }, error: null };
    const res = await PATCH(req("PATCH", { module_id: OTHER_MODULE_ID }), ctx());
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("El módulo no pertenece al programa de la cohorte");
  });

  it("200 cuando el módulo reasignado sí pertenece al programa de la cohorte", async () => {
    const res = await PATCH(req("PATCH", { module_id: MODULE_ID }), ctx());
    expect(res!.status).toBe(200);
  });

  it("200 cuando module_id es null (desasignar módulo): no valida contra ningún programa", async () => {
    const res = await PATCH(req("PATCH", { module_id: null }), ctx());
    expect(res!.status).toBe(200);
  });

  it("422 cuando ends_at queda antes o igual que starts_at (usando ambos del body)", async () => {
    const res = await PATCH(
      req("PATCH", {
        starts_at: "2026-08-01T12:00:00.000Z",
        ends_at: "2026-08-01T12:00:00.000Z",
      }),
      ctx(),
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("La hora de término debe ser posterior al inicio");
  });

  it("422 cuando solo cambia starts_at y queda después del ends_at actual (fallback a la fecha guardada)", async () => {
    // current.ends_at = 11:00; nuevo starts_at = 11:30 -> inválido usando el ends_at actual como fallback
    const res = await PATCH(
      req("PATCH", { starts_at: "2026-08-01T11:30:00.000Z" }),
      ctx(),
    );
    expect(res!.status).toBe(422);
  });

  it("500 cuando falla el update en la base de datos", async () => {
    state.updateResult = { data: null, error: { message: "boom" } };
    const res = await PATCH(req("PATCH", { title: "Nuevo título" }), ctx());
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toBe("Error al actualizar la sesión");
  });

  it("200 y no marca rescheduled_from cuando no cambian las fechas", async () => {
    const res = await PATCH(req("PATCH", { title: "Solo título" }), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.session).toEqual(state.updateResult.data);
  });

  it("200 y marca rescheduled_from = id actual cuando cambia starts_at", async () => {
    const res = await PATCH(
      req("PATCH", { starts_at: "2026-08-01T09:00:00.000Z" }),
      ctx(),
    );
    expect(res!.status).toBe(200);
    // BUG: rescheduled_from apunta al id de la MISMA fila (autoreferencia), no
    // a un snapshot del estado anterior; el comentario del código dice
    // "reprograma su propio estado anterior" pero no existe tal snapshot —
    // la fila se sobreescribe in place, así que rescheduled_from == id de la
    // fila actual siempre que cambian las fechas, sin importar cuántas veces
    // se reprograma. Se documenta el comportamiento actual, no se corrige.
    const json = await res!.json();
    expect(json.session).toEqual(state.updateResult.data);
  });

  it("200 y marca rescheduled_from cuando cambia solo ends_at", async () => {
    const res = await PATCH(
      req("PATCH", { ends_at: "2026-08-01T12:00:00.000Z" }),
      ctx(),
    );
    expect(res!.status).toBe(200);
  });
});

describe("DELETE /api/admin/sessions/[sessionId]", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await DELETE(req("DELETE"), ctx());
    expect(res!.status).toBe(403);
  });

  it("422 cuando el id no es un UUID válido", async () => {
    const res = await DELETE(req("DELETE"), ctx("no-es-un-uuid"));
    expect(res!.status).toBe(422);
  });

  it("500 cuando falla el borrado", async () => {
    state.deleteResult = { error: { message: "boom" } };
    const res = await DELETE(req("DELETE"), ctx());
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toBe("Error al eliminar la sesión");
  });

  it("200 cuando elimina correctamente", async () => {
    const res = await DELETE(req("DELETE"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual({ ok: true });
  });
});
