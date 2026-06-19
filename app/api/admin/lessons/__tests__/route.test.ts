import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));

type State = {
  mod: Record<string, unknown> | null;
  lastPos: Record<string, unknown> | null;
  slugRows: Array<Record<string, unknown>>;
  inserted: { data: unknown; error: unknown };
  updated: { data: unknown; error: unknown };
  progressCount: number;
  deleted: { data: unknown; error: unknown };
};
let state: State;

function makeBuilder(table: string) {
  const ops: Array<[string, unknown[]]> = [];
  const chain = ["select", "insert", "update", "delete", "eq", "in", "is", "not", "order", "limit"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = (...args: unknown[]) => {
      ops.push([m, args]);
      return builder;
    };
  }
  const has = (m: string) => ops.some(([mm]) => mm === m);
  const resolve = () => {
    if (table === "program_modules") return { data: state.mod, error: null };
    if (table === "video_progress") return { count: state.progressCount, error: null };
    if (table === "lessons") {
      if (has("insert")) return state.inserted;
      if (has("update")) return state.updated;
      if (has("delete")) return state.deleted;
      if (has("not")) return { data: state.slugRows, error: null };
      if (has("order")) return { data: state.lastPos, error: null };
      return { data: null, error: null };
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

const { POST } = await import("@/app/api/admin/lessons/route");
const { PATCH, DELETE } = await import("@/app/api/admin/lessons/[lessonId]/route");

const MODULE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const LESSON_ID = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";

function jsonReq(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ lessonId: LESSON_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    mod: { id: MODULE_ID },
    lastPos: { position: 3 },
    slugRows: [{ slug: "introduccion" }],
    inserted: { data: { id: LESSON_ID, slug: "nueva-leccion", title: "Nueva", position: 4 }, error: null },
    updated: { data: { id: LESSON_ID, title: "Editada" }, error: null },
    progressCount: 0,
    deleted: { data: [{ id: LESSON_ID }], error: null },
  };
});

describe("POST /api/admin/lessons (crear)", () => {
  it("422 cuando falta title", async () => {
    const res = await POST(jsonReq("http://x/api/admin/lessons", "POST", { moduleId: MODULE_ID }));
    expect(res!.status).toBe(422);
  });

  it("404 cuando el módulo no existe", async () => {
    state.mod = null;
    const res = await POST(
      jsonReq("http://x/api/admin/lessons", "POST", { moduleId: MODULE_ID, title: "X" }),
    );
    expect(res!.status).toBe(404);
  });

  it("201 crea la lección al final del módulo", async () => {
    const res = await POST(
      jsonReq("http://x/api/admin/lessons", "POST", { moduleId: MODULE_ID, title: "Nueva" }),
    );
    expect(res!.status).toBe(201);
    const json = await res!.json();
    expect(json.id).toBe(LESSON_ID);
    expect(json.position).toBe(4);
  });
});

describe("PATCH /api/admin/lessons/[lessonId] (editar)", () => {
  it("422 cuando el body está vacío", async () => {
    const res = await PATCH(jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", {}), ctx);
    expect(res!.status).toBe(422);
  });

  it("404 cuando la lección no existe", async () => {
    state.updated = { data: null, error: null };
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", { title: "Editada" }),
      ctx,
    );
    expect(res!.status).toBe(404);
  });

  it("200 actualiza metadatos", async () => {
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", {
        title: "Editada",
        unlockAt: "2026-07-01T12:00:00.000Z",
      }),
      ctx,
    );
    expect(res!.status).toBe(200);
  });
});

describe("DELETE /api/admin/lessons/[lessonId] (eliminar con guard)", () => {
  it("409 cuando la lección tiene progreso de alumnos", async () => {
    state.progressCount = 5;
    const res = await DELETE(new Request("http://x/api/admin/lessons/" + LESSON_ID, { method: "DELETE" }), ctx);
    expect(res!.status).toBe(409);
  });

  it("404 cuando no existe (nada borrado)", async () => {
    state.deleted = { data: [], error: null };
    const res = await DELETE(new Request("http://x/api/admin/lessons/" + LESSON_ID, { method: "DELETE" }), ctx);
    expect(res!.status).toBe(404);
  });

  it("200 elimina cuando no hay progreso", async () => {
    const res = await DELETE(new Request("http://x/api/admin/lessons/" + LESSON_ID, { method: "DELETE" }), ctx);
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.deleted).toBe(true);
  });
});
