import { describe, it, expect, vi, beforeEach } from "vitest";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

const notifyDeliverableOpenSpy = vi.fn(async (..._args: unknown[]) => ({ skipped: false, sent: 1 }));
vi.mock("@/lib/deliverables/notify", () => ({
  notifyDeliverableOpen: (...args: unknown[]) => notifyDeliverableOpenSpy(...args),
}));

type Result = { data?: unknown; error?: unknown };

type State = {
  getResult: Result; // GET: select(...).eq(...).order(...)
  insertResult: Result; // POST: insert(...).select().single()
};
let state: State;

const insertSpy = vi.fn();

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  const methods = ["select", "insert", "eq", "order"];
  for (const m of methods) {
    b[m] = (...args: unknown[]) => {
      if (m === "insert") insertSpy(table, ...args);
      return b;
    };
  }
  b.single = () => Promise.resolve(state.insertResult);
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(state.getResult).then(res, rej);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => makeBuilder(table),
  })),
}));

const { GET, POST } = await import("@/app/api/admin/deliverables/route");

function getReq(qs: string) {
  return new Request("http://x/api/admin/deliverables" + qs);
}

function jsonReq(body: unknown) {
  return new Request("http://x/api/admin/deliverables", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawReq(rawBody: string) {
  return new Request("http://x/api/admin/deliverables", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-999999999999";

beforeEach(() => {
  vi.clearAllMocks();
  authResult = { user: { id: "admin-1" } };
  state = {
    getResult: { data: [], error: null },
    insertResult: {
      data: { id: "deliv-1", title: "Entregable" },
      error: null,
    },
  };
});

describe("GET /api/admin/deliverables", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = (await GET(getReq(`?programId=${PROGRAM_ID}`)))!;
    expect(res.status).toBe(403);
  });

  it("422 cuando falta programId", async () => {
    const res = (await GET(getReq("")))!;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("programId es requerido");
  });

  it("500 cuando la DB falla", async () => {
    state.getResult = { data: null, error: { message: "boom" } };
    const res = (await GET(getReq(`?programId=${PROGRAM_ID}`)))!;
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al obtener entregables");
  });

  it("200 y deliverables vacío cuando data es null", async () => {
    state.getResult = { data: null, error: null };
    const res = (await GET(getReq(`?programId=${PROGRAM_ID}`)))!;
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deliverables).toEqual([]);
  });

  it("200 mapea submissionCount desde deliverable_submissions[0].count", async () => {
    state.getResult = {
      data: [
        {
          id: "d1",
          title: "Uno",
          deliverable_submissions: [{ count: 3 }],
        },
      ],
      error: null,
    };
    const res = (await GET(getReq(`?programId=${PROGRAM_ID}`)))!;
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deliverables).toEqual([{ id: "d1", title: "Uno", submissionCount: 3 }]);
  });

  it("200 usa submissionCount 0 cuando deliverable_submissions viene vacío", async () => {
    state.getResult = {
      data: [{ id: "d2", title: "Dos", deliverable_submissions: [] }],
      error: null,
    };
    const res = (await GET(getReq(`?programId=${PROGRAM_ID}`)))!;
    const json = await res.json();
    expect(json.deliverables).toEqual([{ id: "d2", title: "Dos", submissionCount: 0 }]);
  });

  it("200 usa submissionCount 0 cuando deliverable_submissions es undefined", async () => {
    state.getResult = {
      data: [{ id: "d3", title: "Tres" }],
      error: null,
    };
    const res = (await GET(getReq(`?programId=${PROGRAM_ID}`)))!;
    const json = await res.json();
    expect(json.deliverables).toEqual([{ id: "d3", title: "Tres", submissionCount: 0 }]);
  });
});

describe("POST /api/admin/deliverables", () => {
  const baseBody = {
    programId: PROGRAM_ID,
    title: "Entregable de prueba",
    opensAt: "2099-01-01T00:00:00.000Z",
    dueAt: "2099-01-10T00:00:00.000Z",
    allowedFileTypes: ["pdf"],
  };

  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = (await POST(jsonReq(baseBody)))!;
    expect(res.status).toBe(403);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const res = (await POST(rawReq("{no-es-json")))!;
    expect(res.status).toBe(400);
  });

  it("422 cuando falta un campo requerido (validación de schema)", async () => {
    const { title: _title, ...rest } = baseBody;
    const res = (await POST(jsonReq(rest)))!;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
  });

  it("422 cuando allowedFileTypes viene vacío", async () => {
    const res = (await POST(jsonReq({ ...baseBody, allowedFileTypes: [] })))!;
    expect(res.status).toBe(422);
  });

  it("422 cuando allowedFileTypes trae una categoría desconocida", async () => {
    const res = (await POST(jsonReq({ ...baseBody, allowedFileTypes: ["zip"] })))!;
    expect(res.status).toBe(422);
  });

  it("422 cuando dueAt no es posterior a opensAt (refine cruzado)", async () => {
    const res = (await POST(
      jsonReq({ ...baseBody, opensAt: "2099-01-10T00:00:00.000Z", dueAt: "2099-01-01T00:00:00.000Z" }),
    ))!;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.issues[0].message).toBe("dueAt debe ser posterior a opensAt");
  });

  it("500 cuando la DB falla al crear", async () => {
    state.insertResult = { data: null, error: { message: "boom" } };
    const res = (await POST(jsonReq(baseBody)))!;
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al crear el entregable");
  });

  it("201 crea con defaults (sin description/maxFileSizeBytes/allowMultiple) y no notifica si la ventana aún no abre", async () => {
    const res = (await POST(jsonReq(baseBody)))!;
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.deliverable).toEqual({ id: "deliv-1", title: "Entregable" });

    expect(insertSpy).toHaveBeenCalledWith(
      "deliverables",
      expect.objectContaining({
        program_id: PROGRAM_ID,
        title: baseBody.title,
        description: null,
        opens_at: baseBody.opensAt,
        due_at: baseBody.dueAt,
        allowed_file_types: ["pdf"],
        max_file_size_bytes: 50 * 1024 * 1024,
        allow_multiple: false,
        created_by: "admin-1",
      }),
    );
    expect(notifyDeliverableOpenSpy).not.toHaveBeenCalled();
  });

  it("201 crea con todos los campos opcionales explícitos", async () => {
    const res = (await POST(
      jsonReq({
        ...baseBody,
        description: "Instrucciones",
        maxFileSizeBytes: 1024,
        allowMultiple: true,
      }),
    ))!;
    expect(res.status).toBe(201);
    expect(insertSpy).toHaveBeenCalledWith(
      "deliverables",
      expect.objectContaining({
        description: "Instrucciones",
        max_file_size_bytes: 1024,
        allow_multiple: true,
      }),
    );
  });

  it("422 cuando maxFileSizeBytes excede el máximo permitido (50MB)", async () => {
    const res = (await POST(jsonReq({ ...baseBody, maxFileSizeBytes: 50 * 1024 * 1024 + 1 })))!;
    expect(res.status).toBe(422);
  });

  it("201 notifica de inmediato cuando la ventana ya está abierta (opensAt en el pasado)", async () => {
    const res = (await POST(
      jsonReq({
        ...baseBody,
        opensAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ))!;
    expect(res.status).toBe(201);
    expect(notifyDeliverableOpenSpy).toHaveBeenCalledWith("deliv-1");
  });
});
