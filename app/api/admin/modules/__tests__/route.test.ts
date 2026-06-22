import { describe, it, expect, vi, beforeEach } from "vitest";

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
  const resolve = () => {
    if (table === "programs") return { data: state.program, error: null };
    if (table === "lessons") return { data: state.moduleLessons, error: null };
    if (table === "video_progress") return { count: state.progressCount, error: null };
    if (table === "class_sessions") return { count: state.sessionCount, error: null };
    if (table === "program_modules") {
      if (has("insert")) return state.inserted;
      if (has("update")) return state.updated;
      if (has("delete")) return state.deleted;
      if (has("not")) return { data: state.slugRows, error: null };
      if (has("order")) return { data: state.lastPos, error: null };
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

const { POST } = await import("@/app/api/admin/modules/route");
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
  };
});

describe("POST /api/admin/modules (crear)", () => {
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
