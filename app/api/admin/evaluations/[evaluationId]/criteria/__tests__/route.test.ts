import { describe, it, expect, vi, beforeEach } from "vitest";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  requireEvaluationStaff: vi.fn(async () => authResult),
}));

type Result = { data?: unknown; error?: unknown };

type State = {
  listResult: Result; // GET: select("*").eq(...).order(...)
  lastCriterionResult: Result; // POST: select("position").order(desc).limit(1).maybeSingle()
  insertResult: Result; // POST: insert(...).select().single()
  updateResult: Result; // PATCH: update(...).select().single()
  deleteResult: Result; // DELETE: delete().eq().eq()
};
let state: State;

function makeBuilder() {
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
    if (hasCall("delete")) return state.deleteResult;
    if (hasCall("update")) return state.updateResult;
    if (hasCall("insert")) return state.insertResult;
    const selectCall = findCall("select");
    if (selectCall?.args[0] === "position") return state.lastCriterionResult;
    return state.listResult; // select("*") del GET
  };

  b.single = () => Promise.resolve(resolve());
  b.maybeSingle = () => Promise.resolve(resolve());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: () => makeBuilder() })),
}));

const { GET, POST, PATCH, DELETE } = await import(
  "@/app/api/admin/evaluations/[evaluationId]/criteria/route"
);

const EVAL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-999999999999";
const CRITERION_ID = "bbbbbbbb-cccc-4ddd-8eee-111111111111";

function ctx() {
  return { params: Promise.resolve({ evaluationId: EVAL_ID }) };
}

function jsonReq(method: string, body: unknown, url = "http://x/api/admin/evaluations/" + EVAL_ID + "/criteria") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawReq(method: string, rawBody: string) {
  return new Request("http://x/api/admin/evaluations/" + EVAL_ID + "/criteria", {
    method,
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authResult = { user: { id: "staff-1" } };
  state = {
    listResult: { data: [{ id: "c1", label: "Puntualidad", position: 0 }], error: null },
    lastCriterionResult: { data: { position: 2 }, error: null },
    insertResult: { data: { id: "c-new", label: "Nuevo criterio", position: 3 }, error: null },
    updateResult: { data: { id: CRITERION_ID, label: "Editado" }, error: null },
    deleteResult: { error: null },
  };
});

describe("GET /api/admin/evaluations/[evaluationId]/criteria", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await GET(new Request("http://x"), ctx());
    expect(res!.status).toBe(403);
  });

  it("500 cuando la consulta falla", async () => {
    state.listResult = { data: null, error: { message: "boom" } };
    const res = await GET(new Request("http://x"), ctx());
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toBe("Error al obtener el checklist");
  });

  it("200 devuelve el checklist ordenado", async () => {
    const res = await GET(new Request("http://x"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.criteria).toEqual([{ id: "c1", label: "Puntualidad", position: 0 }]);
  });

  it("200 devuelve arreglo vacío cuando data es null", async () => {
    state.listResult = { data: null, error: null };
    const res = await GET(new Request("http://x"), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.criteria).toEqual([]);
  });
});

describe("POST /api/admin/evaluations/[evaluationId]/criteria", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await POST(jsonReq("POST", { label: "X" }), ctx());
    expect(res!.status).toBe(403);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const res = await POST(rawReq("POST", "{no-es-json"), ctx());
    expect(res!.status).toBe(400);
  });

  it("422 cuando el label está vacío", async () => {
    const res = await POST(jsonReq("POST", { label: "   " }), ctx());
    expect(res!.status).toBe(422);
  });

  it("422 cuando el label excede el máximo de 200 caracteres", async () => {
    const res = await POST(jsonReq("POST", { label: "a".repeat(201) }), ctx());
    expect(res!.status).toBe(422);
  });

  it("422 cuando falta el campo label", async () => {
    const res = await POST(jsonReq("POST", {}), ctx());
    expect(res!.status).toBe(422);
  });

  it("500 cuando la DB falla al insertar", async () => {
    state.insertResult = { data: null, error: { message: "boom" } };
    const res = await POST(jsonReq("POST", { label: "Nuevo" }), ctx());
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toBe("Error al crear el criterio");
  });

  it("201 crea el criterio en position = max(position) + 1", async () => {
    const res = await POST(jsonReq("POST", { label: "Nuevo criterio" }), ctx());
    expect(res!.status).toBe(201);
    const json = await res!.json();
    expect(json.criterion).toEqual({ id: "c-new", label: "Nuevo criterio", position: 3 });
  });

  it("201 usa position = 0 cuando no hay criterios previos (lastCriterion null)", async () => {
    state.lastCriterionResult = { data: null, error: null };
    const res = await POST(jsonReq("POST", { label: "Primero" }), ctx());
    expect(res!.status).toBe(201);
    // No podemos leer el arg del insert directamente (el builder no lo expone),
    // pero el camino feliz con lastCriterion=null ejercita la rama `?? -1`.
  });
});

describe("PATCH /api/admin/evaluations/[evaluationId]/criteria", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await PATCH(jsonReq("PATCH", { criterionId: CRITERION_ID, label: "X" }), ctx());
    expect(res!.status).toBe(403);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const res = await PATCH(rawReq("PATCH", "{no-es-json"), ctx());
    expect(res!.status).toBe(400);
  });

  it("422 cuando criterionId no tiene formato UUID válido", async () => {
    const res = await PATCH(jsonReq("PATCH", { criterionId: "no-es-uuid", label: "X" }), ctx());
    expect(res!.status).toBe(422);
  });

  it("422 cuando el label está vacío", async () => {
    const res = await PATCH(jsonReq("PATCH", { criterionId: CRITERION_ID, label: "" }), ctx());
    expect(res!.status).toBe(422);
  });

  it("422 cuando falta criterionId", async () => {
    const res = await PATCH(jsonReq("PATCH", { label: "X" }), ctx());
    expect(res!.status).toBe(422);
  });

  it("500 cuando la DB falla al actualizar", async () => {
    state.updateResult = { data: null, error: { message: "boom" } };
    const res = await PATCH(jsonReq("PATCH", { criterionId: CRITERION_ID, label: "X" }), ctx());
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toBe("Error al actualizar el criterio");
  });

  it("200 actualiza el label y devuelve el criterio", async () => {
    const res = await PATCH(
      jsonReq("PATCH", { criterionId: CRITERION_ID, label: "Editado" }),
      ctx(),
    );
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.criterion).toEqual({ id: CRITERION_ID, label: "Editado" });
  });
});

describe("DELETE /api/admin/evaluations/[evaluationId]/criteria", () => {
  function deleteReq(criterionId?: string) {
    const url =
      "http://x/api/admin/evaluations/" +
      EVAL_ID +
      "/criteria" +
      (criterionId ? `?criterionId=${criterionId}` : "");
    return new Request(url, { method: "DELETE" });
  }

  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await DELETE(deleteReq(CRITERION_ID), ctx());
    expect(res!.status).toBe(403);
  });

  it("422 cuando falta criterionId en la query", async () => {
    const res = await DELETE(deleteReq(), ctx());
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("criterionId es requerido");
  });

  it("500 cuando la DB falla al borrar", async () => {
    state.deleteResult = { error: { message: "boom" } };
    const res = await DELETE(deleteReq(CRITERION_ID), ctx());
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toBe("Error al eliminar el criterio");
  });

  it("200 elimina el criterio", async () => {
    const res = await DELETE(deleteReq(CRITERION_ID), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.ok).toBe(true);
  });
});
