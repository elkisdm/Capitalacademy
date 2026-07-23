import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));

type Res = { data: unknown; error: unknown };
type State = {
  program: Record<string, unknown> | null;
  postDupe: Record<string, unknown> | null;
  lastPos: Record<string, unknown> | null;
  slugRows: Array<Record<string, unknown>>;
  inserted: Res;
  patchCurrent: Record<string, unknown> | null;
  patchDupe: Record<string, unknown> | null;
  updated: Res;
  moduleLessons: Array<Record<string, unknown>>;
  progressCount: number;
  sessionCount: number;
  deleted: Res;
  cohort: Record<string, unknown> | null;
  modulesList: Array<Record<string, unknown>> | null;
};
let state: State;

function makeBuilder(table: string) {
  const ops: Array<[string, unknown[]]> = [];
  const chain = ["select", "insert", "update", "delete", "eq", "in", "is", "not", "neq", "order", "limit"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = (...args: unknown[]) => {
      ops.push([m, args]);
      return builder;
    };
  }
  const has = (m: string) => ops.some(([mm]) => mm === m);
  const eqFields = () => ops.filter(([m]) => m === "eq").map(([, a]) => a[0]);
  const orderAscending = () => {
    const call = ops.find(([m]) => m === "order");
    if (!call) return undefined;
    const opts = call[1][1] as { ascending?: boolean } | undefined;
    return opts?.ascending;
  };
  const resolve = () => {
    if (table === "programs") return { data: state.program, error: null };
    if (table === "cohorts") return { data: state.cohort, error: null };
    if (table === "lessons") return { data: state.moduleLessons, error: null };
    if (table === "video_progress") return { count: state.progressCount, error: null };
    if (table === "class_sessions") return { count: state.sessionCount, error: null };
    if (table === "program_modules") {
      if (has("insert")) return state.inserted;
      if (has("update")) return state.updated;
      if (has("delete")) return state.deleted;
      if (has("not")) return { data: state.slugRows, error: null };
      if (has("order")) {
        // El listado GET ordena ascendente; la búsqueda de última posición
        // del POST ordena descendente. Se distingue por ese flag.
        if (orderAscending() === true) return { data: state.modulesList, error: null };
        return { data: state.lastPos, error: null };
      }
      if (has("neq")) return { data: state.patchDupe, error: null };
      if (eqFields().includes("code")) return { data: state.postDupe, error: null };
      return { data: state.patchCurrent, error: null };
    }
    return { data: null, error: null };
  };
  builder.single = () => Promise.resolve(resolve());
  builder.maybeSingle = () => Promise.resolve(resolve());
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: (table: string) => makeBuilder(table) })),
}));

const { authorizeAdmin } = await import("@/lib/auth/authorize-admin");
const { GET, POST } = await import("@/app/api/admin/modules/route");
const { PATCH, DELETE } = await import("@/app/api/admin/modules/[moduleId]/route");

const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const MODULE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";

function jsonReq(method: string, body: unknown) {
  return new Request("http://x/api/admin/modules", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ moduleId: MODULE_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    program: { id: PROGRAM_ID },
    postDupe: null,
    lastPos: { position: 2 },
    slugRows: [{ slug: "m1-intro" }],
    inserted: { data: { id: MODULE_ID, code: "M2", title: "Nuevo", position: 3 }, error: null },
    patchCurrent: { program_id: PROGRAM_ID },
    patchDupe: null,
    updated: { data: { id: MODULE_ID, code: "M2", title: "Editado" }, error: null },
    moduleLessons: [],
    progressCount: 0,
    sessionCount: 0,
    deleted: { data: [{ id: MODULE_ID }], error: null },
    cohort: { program_id: PROGRAM_ID },
    modulesList: [{ id: MODULE_ID, title: "M1", position: 1 }],
  };
});

const COHORT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-333333333333";

describe("GET /api/admin/modules (listar por cohorte)", () => {
  it("401/403 cuando authorizeAdmin rechaza", async () => {
    vi.mocked(authorizeAdmin).mockResolvedValueOnce({
      error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    });
    const res = await GET(new Request(`http://x/api/admin/modules?cohortId=${COHORT_ID}`));
    expect(res!.status).toBe(403);
  });

  it("422 cuando falta cohortId", async () => {
    const res = await GET(new Request("http://x/api/admin/modules"));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toContain("cohortId");
  });

  it("404 cuando la cohorte no existe", async () => {
    state.cohort = null;
    const res = await GET(new Request(`http://x/api/admin/modules?cohortId=${COHORT_ID}`));
    expect(res!.status).toBe(404);
  });

  it("200 devuelve los módulos del programa de la cohorte, mapeados", async () => {
    state.modulesList = [
      { id: MODULE_ID, title: "M1", position: 1, code: "extra-no-deberia-filtrarse" },
    ];
    const res = await GET(new Request(`http://x/api/admin/modules?cohortId=${COHORT_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual([{ id: MODULE_ID, title: "M1", position: 1 }]);
  });

  it("200 con lista vacía cuando el programa no tiene módulos", async () => {
    state.modulesList = null;
    const res = await GET(new Request(`http://x/api/admin/modules?cohortId=${COHORT_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json).toEqual([]);
  });
});

describe("POST /api/admin/modules (crear)", () => {
  it("401/403 cuando authorizeAdmin rechaza", async () => {
    vi.mocked(authorizeAdmin).mockResolvedValueOnce({
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    });
    const res = await POST(jsonReq("POST", { programId: PROGRAM_ID, code: "M2", title: "X" }));
    expect(res!.status).toBe(401);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const req = new Request("http://x/api/admin/modules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{no-es-json",
    });
    const res = await POST(req);
    expect(res!.status).toBe(400);
  });

  it("422 cuando falta code o title", async () => {
    const res = await POST(jsonReq("POST", { programId: PROGRAM_ID, title: "X" }));
    expect(res!.status).toBe(422);
  });

  it("404 cuando el programa no existe", async () => {
    state.program = null;
    const res = await POST(jsonReq("POST", { programId: PROGRAM_ID, code: "M2", title: "X" }));
    expect(res!.status).toBe(404);
  });

  it("409 cuando el código ya existe en el programa", async () => {
    state.postDupe = { id: "other" };
    const res = await POST(jsonReq("POST", { programId: PROGRAM_ID, code: "M1", title: "X" }));
    expect(res!.status).toBe(409);
  });

  it("201 crea el módulo al final del programa", async () => {
    const res = await POST(jsonReq("POST", { programId: PROGRAM_ID, code: "M2", title: "Nuevo" }));
    expect(res!.status).toBe(201);
    const json = await res!.json();
    expect(json.position).toBe(3);
  });

  it("201 con description explícita", async () => {
    const res = await POST(
      jsonReq("POST", { programId: PROGRAM_ID, code: "M2", title: "Nuevo", description: "desc" }),
    );
    expect(res!.status).toBe(201);
  });

  it("posición 1 cuando el programa aún no tiene módulos", async () => {
    state.lastPos = null;
    state.inserted = { data: { id: MODULE_ID, code: "M2", title: "Nuevo", position: 1 }, error: null };
    const res = await POST(jsonReq("POST", { programId: PROGRAM_ID, code: "M2", title: "Nuevo" }));
    expect(res!.status).toBe(201);
    const json = await res!.json();
    expect(json.position).toBe(1);
  });

  it("403 cuando el insert falla por RLS (42501)", async () => {
    state.inserted = { data: null, error: { code: "42501", message: "denied" } };
    const res = await POST(jsonReq("POST", { programId: PROGRAM_ID, code: "M2", title: "Nuevo" }));
    expect(res!.status).toBe(403);
  });

  it("500 cuando el insert falla por otra razón", async () => {
    state.inserted = { data: null, error: { code: "23505", message: "otro error" } };
    const res = await POST(jsonReq("POST", { programId: PROGRAM_ID, code: "M2", title: "Nuevo" }));
    expect(res!.status).toBe(500);
  });
});

describe("PATCH /api/admin/modules/[moduleId] (editar)", () => {
  it("422 cuando el body está vacío", async () => {
    const res = await PATCH(jsonReq("PATCH", {}), ctx);
    expect(res!.status).toBe(422);
  });

  it("409 cuando el nuevo código choca con otro módulo", async () => {
    state.patchDupe = { id: "other" };
    const res = await PATCH(jsonReq("PATCH", { code: "M1" }), ctx);
    expect(res!.status).toBe(409);
  });

  it("200 actualiza el módulo", async () => {
    const res = await PATCH(jsonReq("PATCH", { title: "Editado" }), ctx);
    expect(res!.status).toBe(200);
  });
});

describe("DELETE /api/admin/modules/[moduleId] (con guard)", () => {
  it("409 cuando alguna lección del módulo tiene progreso", async () => {
    state.moduleLessons = [{ id: "l1" }];
    state.progressCount = 3;
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx);
    expect(res!.status).toBe(409);
  });

  it("409 cuando hay sesiones de calendario vinculadas al módulo", async () => {
    state.sessionCount = 2;
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx);
    expect(res!.status).toBe(409);
    const json = await res!.json();
    expect(json.error).toContain("sesión");
  });

  it("200 elimina cuando no hay progreso ni sesiones vinculadas", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx);
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.deleted).toBe(true);
  });

  it("404 cuando el módulo no existe", async () => {
    state.deleted = { data: [], error: null };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx);
    expect(res!.status).toBe(404);
  });
});
