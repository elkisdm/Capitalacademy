import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));

type State = {
  mod: Record<string, unknown> | null;
  // Por id de módulo, para distinguir el módulo ORIGEN del módulo DESTINO
  // cuando se mueve una lección (si no está seteado, cae en `mod` para ambos).
  modByModule?: Record<string, Record<string, unknown> | null>;
  lessonRow: Record<string, unknown> | null;
  // Cola opcional para el select plano de "lessons": permite que la primera
  // lectura (lookup al mover) y la segunda (fetch no-op) devuelvan cosas
  // distintas. Si no está seteada, ambas usan `lessonRow`.
  lessonRowQueue?: Array<Record<string, unknown> | null>;
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
    if (table === "program_modules") {
      if (state.modByModule) {
        const eqOp = ops.find(([m]) => m === "eq");
        const idArg = eqOp ? (eqOp[1][1] as string) : undefined;
        if (idArg && idArg in state.modByModule) {
          return { data: state.modByModule[idArg], error: null };
        }
      }
      return { data: state.mod, error: null };
    }
    if (table === "video_progress") return { count: state.progressCount, error: null };
    if (table === "lessons") {
      if (has("insert")) return state.inserted;
      if (has("update")) return state.updated;
      if (has("delete")) return state.deleted;
      if (has("not")) return { data: state.slugRows, error: null };
      if (has("order")) return { data: state.lastPos, error: null };
      // select plano (p.ej. lookup de module_id al mover, o fetch no-op).
      if (state.lessonRowQueue && state.lessonRowQueue.length > 0) {
        return { data: state.lessonRowQueue.shift() ?? null, error: null };
      }
      return { data: state.lessonRow, error: null };
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
    mod: { id: MODULE_ID, program_id: "prog-1" },
    modByModule: undefined,
    lessonRow: { module_id: MODULE_ID },
    lessonRowQueue: undefined,
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
  it("propaga el error de autorización cuando authorizeAdmin rechaza", async () => {
    vi.mocked(authorizeAdmin).mockResolvedValueOnce({
      error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    });
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", { title: "Editada" }),
      ctx,
    );
    expect(res!.status).toBe(403);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const badReq = new Request("http://x/api/admin/lessons/" + LESSON_ID, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "no-es-json{",
    });
    const res = await PATCH(badReq, ctx);
    expect(res!.status).toBe(400);
  });

  it("422 cuando el body está vacío", async () => {
    const res = await PATCH(jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", {}), ctx);
    expect(res!.status).toBe(422);
  });

  it("422 cuando unlockAt no es una fecha válida", async () => {
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", { unlockAt: "no-es-fecha" }),
      ctx,
    );
    expect(res!.status).toBe(422);
  });

  it("200 limpia unlockAt cuando se envía cadena vacía", async () => {
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", { unlockAt: "" }),
      ctx,
    );
    expect(res!.status).toBe(200);
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

  it("200 actualiza description, content, kind y activityType, y limpia content en blanco", async () => {
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", {
        description: null,
        content: "   ",
        kind: "recorded",
        activityType: "practice",
      }),
      ctx,
    );
    expect(res!.status).toBe(200);
  });

  const OTHER_MODULE = "aaaaaaaa-bbbb-4ccc-8ddd-333333333333";

  it("200 mueve la lección a otro módulo del mismo programa", async () => {
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", { moduleId: OTHER_MODULE }),
      ctx,
    );
    expect(res!.status).toBe(200);
  });

  it("422 cuando el módulo destino no existe", async () => {
    state.mod = null; // ambos lookups de program_modules → null ⇒ destino inexistente
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", { moduleId: OTHER_MODULE }),
      ctx,
    );
    expect(res!.status).toBe(422);
  });

  it("404 cuando la lección no existe al intentar moverla", async () => {
    state.lessonRow = null;
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", { moduleId: OTHER_MODULE }),
      ctx,
    );
    expect(res!.status).toBe(404);
  });

  it("422 cuando el módulo destino pertenece a otro programa", async () => {
    // Origen y destino existen, pero con program_id distinto.
    state.modByModule = {
      [MODULE_ID]: { program_id: "prog-1" },
      [OTHER_MODULE]: { program_id: "prog-2" },
    };
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", { moduleId: OTHER_MODULE }),
      ctx,
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toMatch(/otro programa/);
  });

  it("200 no-op cuando se envía el mismo módulo y ningún otro cambio", async () => {
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", { moduleId: MODULE_ID }),
      ctx,
    );
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.module_id).toBe(MODULE_ID);
  });

  it("403 cuando la actualización falla por RLS (42501)", async () => {
    state.updated = { data: null, error: { code: "42501", message: "denied" } };
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", { title: "Editada" }),
      ctx,
    );
    expect(res!.status).toBe(403);
  });

  it("500 cuando la actualización falla por otro error de BD", async () => {
    state.updated = { data: null, error: { code: "23505", message: "otro error" } };
    const res = await PATCH(
      jsonReq("http://x/api/admin/lessons/" + LESSON_ID, "PATCH", { title: "Editada" }),
      ctx,
    );
    expect(res!.status).toBe(500);
  });
});

describe("DELETE /api/admin/lessons/[lessonId] (eliminar con guard)", () => {
  it("propaga el error de autorización cuando authorizeAdmin rechaza", async () => {
    vi.mocked(authorizeAdmin).mockResolvedValueOnce({
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    });
    const res = await DELETE(new Request("http://x/api/admin/lessons/" + LESSON_ID, { method: "DELETE" }), ctx);
    expect(res!.status).toBe(401);
  });

  it("500 cuando falla el borrado en BD", async () => {
    state.deleted = { data: null, error: { code: "XXXXX", message: "boom" } };
    const res = await DELETE(new Request("http://x/api/admin/lessons/" + LESSON_ID, { method: "DELETE" }), ctx);
    expect(res!.status).toBe(500);
  });

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
