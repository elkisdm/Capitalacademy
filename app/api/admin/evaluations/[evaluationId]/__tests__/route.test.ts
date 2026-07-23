import { describe, it, expect, vi, beforeEach } from "vitest";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data?: unknown; error?: unknown; count?: number | null };

type State = {
  evalResult: Result; // GET: select("*").eq(id).single()
  questionsResult: Result; // GET: select("*").eq(...).order(...)
  evalKindResult: Result; // PATCH isActive guard: select("kind").eq(id).single()
  questionsCountResult: Result; // PATCH isActive guard: count de quiz_questions
  evalWindowResult: Result; // PATCH cross-validate: select("opens_at, closes_at").single()
  updateResult: Result; // PATCH: update(...).select().single()
  attemptsCountResult: Result; // DELETE: count de quiz_attempts
  gradesCountResult: Result; // DELETE: count de evaluation_grades
  deleteResult: Result; // DELETE: delete().eq(id)
};
let state: State;

function makeBuilder(table: string) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const methods = ["select", "insert", "update", "delete", "eq", "order", "limit"];
  const b: Record<string, unknown> = {};
  for (const m of methods) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  const hasCall = (m: string) => calls.some((c) => c.method === m);
  const findCall = (m: string) => calls.find((c) => c.method === m);

  const resolve = (): Result => {
    if (table === "evaluations") {
      if (hasCall("delete")) return state.deleteResult;
      if (hasCall("update")) return state.updateResult;
      const selectCall = findCall("select");
      const cols = selectCall?.args[0];
      if (cols === "kind") return state.evalKindResult;
      if (cols === "opens_at, closes_at") return state.evalWindowResult;
      return state.evalResult; // select("*") del GET
    }
    if (table === "quiz_questions") {
      if (hasCall("order")) return state.questionsResult; // GET lista
      return state.questionsCountResult; // PATCH guard de activación
    }
    if (table === "quiz_attempts") return state.attemptsCountResult;
    if (table === "evaluation_grades") return state.gradesCountResult;
    return { data: null, error: null };
  };

  b.single = () => Promise.resolve(resolve());
  b.maybeSingle = () => Promise.resolve(resolve());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeBuilder(table) })),
}));

const { GET, PATCH, DELETE } = await import("@/app/api/admin/evaluations/[evaluationId]/route");

const EVAL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-999999999999";

function ctx() {
  return { params: Promise.resolve({ evaluationId: EVAL_ID }) };
}

function jsonReq(method: string, body: unknown) {
  return new Request("http://x/api/admin/evaluations/" + EVAL_ID, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawReq(method: string, rawBody: string) {
  return new Request("http://x/api/admin/evaluations/" + EVAL_ID, {
    method,
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authResult = { user: { id: "admin-1" } };
  state = {
    evalResult: { data: { id: EVAL_ID, title: "Examen final", kind: "quiz" }, error: null },
    questionsResult: { data: [{ id: "q1", sort_order: 1 }], error: null },
    evalKindResult: { data: { kind: "quiz" }, error: null },
    questionsCountResult: { count: 3, error: null },
    evalWindowResult: { data: { opens_at: null, closes_at: null }, error: null },
    updateResult: { data: { id: EVAL_ID, title: "Editado" }, error: null },
    attemptsCountResult: { count: 0, error: null },
    gradesCountResult: { count: 0, error: null },
    deleteResult: { error: null },
  };
});

describe("GET /api/admin/evaluations/[evaluationId]", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await GET(new Request("http://x"), ctx());
    expect(res!.status).toBe(403);
  });

  it("404 cuando la evaluación no existe", async () => {
    state.evalResult = { data: null, error: null };
    const res = await GET(new Request("http://x"), ctx());
    expect(res!.status).toBe(404);
  });

  it("404 cuando la consulta devuelve error", async () => {
    state.evalResult = { data: null, error: { message: "boom" } };
    const res = await GET(new Request("http://x"), ctx());
    expect(res!.status).toBe(404);
  });

  it("200 devuelve evaluación + preguntas", async () => {
    const res = await GET(new Request("http://x"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.evaluation.id).toBe(EVAL_ID);
    expect(json.questions).toEqual([{ id: "q1", sort_order: 1 }]);
  });

  it("200 devuelve arreglo vacío cuando no hay preguntas (null)", async () => {
    state.questionsResult = { data: null, error: null };
    const res = await GET(new Request("http://x"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.questions).toEqual([]);
  });
});

describe("PATCH /api/admin/evaluations/[evaluationId]", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await PATCH(jsonReq("PATCH", { title: "X" }), ctx());
    expect(res!.status).toBe(403);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const res = await PATCH(rawReq("PATCH", "{no-es-json"), ctx());
    expect(res!.status).toBe(400);
  });

  it("422 cuando el body está vacío (sin campos)", async () => {
    const res = await PATCH(jsonReq("PATCH", {}), ctx());
    expect(res!.status).toBe(422);
  });

  it("422 cuando un campo numérico está fuera de rango", async () => {
    const res = await PATCH(jsonReq("PATCH", { passingGradePct: 150 }), ctx());
    expect(res!.status).toBe(422);
  });

  it("422 cuando la fecha no es válida", async () => {
    const res = await PATCH(jsonReq("PATCH", { opensAt: "no-es-fecha" }), ctx());
    expect(res!.status).toBe(422);
  });

  it("422 al activar un quiz sin preguntas", async () => {
    state.evalKindResult = { data: { kind: "quiz" }, error: null };
    state.questionsCountResult = { count: 0, error: null };
    const res = await PATCH(jsonReq("PATCH", { isActive: true }), ctx());
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toMatch(/sin preguntas/);
  });

  it("200 al activar un quiz que sí tiene preguntas", async () => {
    state.evalKindResult = { data: { kind: "quiz" }, error: null };
    state.questionsCountResult = { count: 5, error: null };
    const res = await PATCH(jsonReq("PATCH", { isActive: true }), ctx());
    expect(res!.status).toBe(200);
  });

  it("200 al activar una evaluación manual aunque no tenga preguntas (guard no aplica)", async () => {
    state.evalKindResult = { data: { kind: "manual" }, error: null };
    state.questionsCountResult = { count: 0, error: null };
    const res = await PATCH(jsonReq("PATCH", { isActive: true }), ctx());
    expect(res!.status).toBe(200);
  });

  it("422 cuando solo se envía closesAt y queda antes/igual al opensAt persistido", async () => {
    state.evalWindowResult = {
      data: { opens_at: "2026-08-10T00:00:00.000Z", closes_at: null },
      error: null,
    };
    const res = await PATCH(
      jsonReq("PATCH", { closesAt: "2026-08-01T00:00:00.000Z" }),
      ctx(),
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toMatch(/posterior a la de apertura/);
  });

  it("200 cuando solo se envía opensAt y es compatible con el closesAt persistido", async () => {
    state.evalWindowResult = {
      data: { opens_at: null, closes_at: "2026-09-01T00:00:00.000Z" },
      error: null,
    };
    const res = await PATCH(
      jsonReq("PATCH", { opensAt: "2026-08-01T00:00:00.000Z" }),
      ctx(),
    );
    expect(res!.status).toBe(200);
  });

  it("200 cuando se envían ambos extremos (no se valida en JS, queda a cargo del check de la DB)", async () => {
    const res = await PATCH(
      jsonReq("PATCH", {
        opensAt: "2026-08-10T00:00:00.000Z",
        closesAt: "2026-08-01T00:00:00.000Z",
      }),
      ctx(),
    );
    // Comportamiento a propósito (comentario en el fuente): cuando vienen
    // AMBOS extremos, el guard en JS no hace el fetch ni valida el orden —
    // se apoya en el CHECK de la DB (23514) como backstop. Este mock no
    // simula ese constraint, así que el "éxito" acá solo confirma que el
    // guard JS se salta correctamente cuando corresponde, no que el orden
    // de fechas sea correcto (eso lo cubre el test de la rama 23514).
    expect(res!.status).toBe(200);
  });

  it("200 cuando ni opensAt ni closesAt vienen en el body (se omite la validación cruzada)", async () => {
    const res = await PATCH(jsonReq("PATCH", { title: "Nuevo título" }), ctx());
    expect(res!.status).toBe(200);
  });

  it("409 cuando la DB devuelve 23505 (duplicado activo)", async () => {
    state.updateResult = { data: null, error: { code: "23505" } };
    const res = await PATCH(jsonReq("PATCH", { title: "X" }), ctx());
    expect(res!.status).toBe(409);
  });

  it("422 cuando la DB devuelve 23514 (check violation de ventana)", async () => {
    state.updateResult = { data: null, error: { code: "23514" } };
    const res = await PATCH(jsonReq("PATCH", { title: "X" }), ctx());
    expect(res!.status).toBe(422);
  });

  it("500 cuando la DB devuelve un error genérico", async () => {
    state.updateResult = { data: null, error: { code: "99999", message: "boom" } };
    const res = await PATCH(jsonReq("PATCH", { title: "X" }), ctx());
    expect(res!.status).toBe(500);
  });

  it("200 actualiza campos y devuelve la evaluación actualizada", async () => {
    const res = await PATCH(
      jsonReq("PATCH", {
        title: "Nuevo título",
        description: null,
        weightPct: 25,
        minCompletionPct: null,
        timeLimitMinutes: null,
      }),
      ctx(),
    );
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.evaluation.title).toBe("Editado");
  });
});

describe("DELETE /api/admin/evaluations/[evaluationId]", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx());
    expect(res!.status).toBe(403);
  });

  it("409 cuando ya tiene intentos de alumnos", async () => {
    state.attemptsCountResult = { count: 2, error: null };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx());
    expect(res!.status).toBe(409);
    const json = await res!.json();
    expect(json.error).toMatch(/intentos de alumnos/);
  });

  it("409 cuando no tiene intentos pero ya tiene notas cargadas", async () => {
    state.attemptsCountResult = { count: 0, error: null };
    state.gradesCountResult = { count: 4, error: null };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx());
    expect(res!.status).toBe(409);
    const json = await res!.json();
    expect(json.error).toMatch(/notas cargadas/);
  });

  it("500 cuando la DB falla al borrar", async () => {
    state.deleteResult = { error: { message: "boom" } };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx());
    expect(res!.status).toBe(500);
  });

  it("200 elimina cuando no hay intentos ni notas", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.ok).toBe(true);
  });
});
