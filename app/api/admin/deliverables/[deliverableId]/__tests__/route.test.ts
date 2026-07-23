import { describe, it, expect, vi, beforeEach } from "vitest";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data?: unknown; error?: unknown };

type State = {
  currentResult: Result; // PATCH: select("opens_at, due_at").eq(id).single()
  updateResult: Result; // PATCH: update(...).select().single()
  deleteResult: Result; // DELETE: delete().eq(id)
  submissionsResult: Result; // DELETE: select("storage_path").eq(deliverable_id, id)
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
  const findCall = (m: string) => calls.find((c) => c.method === m);

  const resolve = (): Result => {
    if (table === "deliverables") {
      if (hasCall("delete")) return state.deleteResult;
      if (hasCall("update")) return state.updateResult;
      const selectCall = findCall("select");
      if (selectCall?.args[0] === "opens_at, due_at") return state.currentResult;
      return state.currentResult;
    }
    if (table === "deliverable_submissions") return state.submissionsResult;
    return { data: null, error: null };
  };

  b.single = () => Promise.resolve(resolve());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return b;
}

const removeSpy = vi.fn(
  async (): Promise<{ data: unknown[] | null; error: unknown }> => ({ data: [], error: null }),
);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => makeBuilder(table),
    storage: {
      from: () => ({ remove: removeSpy }),
    },
  })),
}));

const { PATCH, DELETE } = await import(
  "@/app/api/admin/deliverables/[deliverableId]/route"
);

const DELIVERABLE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-999999999999";

function ctx() {
  return { params: Promise.resolve({ deliverableId: DELIVERABLE_ID }) };
}

function jsonReq(method: string, body: unknown) {
  return new Request("http://x/api/admin/deliverables/" + DELIVERABLE_ID, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawReq(method: string, rawBody: string) {
  return new Request("http://x/api/admin/deliverables/" + DELIVERABLE_ID, {
    method,
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authResult = { user: { id: "admin-1" } };
  state = {
    currentResult: {
      data: {
        opens_at: "2026-08-01T00:00:00.000Z",
        due_at: "2026-08-10T00:00:00.000Z",
      },
      error: null,
    },
    updateResult: {
      data: { id: DELIVERABLE_ID, title: "Entregable editado" },
      error: null,
    },
    deleteResult: { error: null },
    submissionsResult: { data: [], error: null },
  };
});

describe("PATCH /api/admin/deliverables/[deliverableId]", () => {
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
    const json = await res!.json();
    expect(json.error).toBe("Validación fallida");
  });

  it("422 cuando opensAt no es una fecha válida", async () => {
    const res = await PATCH(jsonReq("PATCH", { opensAt: "no-es-fecha" }), ctx());
    expect(res!.status).toBe(422);
  });

  it("422 cuando dueAt no es una fecha válida", async () => {
    const res = await PATCH(jsonReq("PATCH", { dueAt: "no-es-fecha" }), ctx());
    expect(res!.status).toBe(422);
  });

  it("422 cuando allowedFileTypes trae una categoría desconocida", async () => {
    const res = await PATCH(
      jsonReq("PATCH", { allowedFileTypes: ["zip"] }),
      ctx(),
    );
    expect(res!.status).toBe(422);
  });

  it("422 cuando allowedFileTypes viene vacío", async () => {
    const res = await PATCH(jsonReq("PATCH", { allowedFileTypes: [] }), ctx());
    expect(res!.status).toBe(422);
  });

  it("422 cuando maxFileSizeBytes excede el máximo permitido (50MB)", async () => {
    const res = await PATCH(
      jsonReq("PATCH", { maxFileSizeBytes: 50 * 1024 * 1024 + 1 }),
      ctx(),
    );
    expect(res!.status).toBe(422);
  });

  it("422 cuando maxFileSizeBytes no es positivo", async () => {
    const res = await PATCH(jsonReq("PATCH", { maxFileSizeBytes: 0 }), ctx());
    expect(res!.status).toBe(422);
  });

  it("404 cuando se edita opensAt/dueAt pero el entregable no existe", async () => {
    state.currentResult = { data: null, error: null };
    const res = await PATCH(
      jsonReq("PATCH", { opensAt: "2026-08-01T00:00:00.000Z" }),
      ctx(),
    );
    expect(res!.status).toBe(404);
  });

  it("422 cuando solo se edita dueAt y queda antes/igual al opensAt persistido", async () => {
    state.currentResult = {
      data: {
        opens_at: "2026-08-10T00:00:00.000Z",
        due_at: "2026-08-20T00:00:00.000Z",
      },
      error: null,
    };
    const res = await PATCH(
      jsonReq("PATCH", { dueAt: "2026-08-01T00:00:00.000Z" }),
      ctx(),
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("dueAt debe ser posterior a opensAt");
  });

  it("422 cuando solo se edita opensAt y queda igual al dueAt persistido", async () => {
    state.currentResult = {
      data: {
        opens_at: "2026-08-01T00:00:00.000Z",
        due_at: "2026-08-10T00:00:00.000Z",
      },
      error: null,
    };
    const res = await PATCH(
      jsonReq("PATCH", { opensAt: "2026-08-10T00:00:00.000Z" }),
      ctx(),
    );
    expect(res!.status).toBe(422);
  });

  it("200 cuando se editan ambos extremos y quedan en orden correcto", async () => {
    const res = await PATCH(
      jsonReq("PATCH", {
        opensAt: "2026-08-01T00:00:00.000Z",
        dueAt: "2026-08-15T00:00:00.000Z",
      }),
      ctx(),
    );
    expect(res!.status).toBe(200);
  });

  it("200 cuando no se editan opensAt ni dueAt (se omite la revalidación cruzada)", async () => {
    const res = await PATCH(jsonReq("PATCH", { title: "Nuevo título" }), ctx());
    expect(res!.status).toBe(200);
  });

  it("500 cuando la DB falla al actualizar", async () => {
    state.updateResult = { data: null, error: { message: "boom" } };
    const res = await PATCH(jsonReq("PATCH", { title: "X" }), ctx());
    expect(res!.status).toBe(500);
  });

  it("200 actualiza todos los campos soportados y devuelve el entregable actualizado", async () => {
    const res = await PATCH(
      jsonReq("PATCH", {
        title: "Nuevo título",
        description: null,
        allowedFileTypes: ["pdf", "word"],
        maxFileSizeBytes: 1024,
        allowMultiple: true,
      }),
      ctx(),
    );
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.deliverable.title).toBe("Entregable editado");
  });

  it("200 acepta description como texto (no solo null)", async () => {
    const res = await PATCH(
      jsonReq("PATCH", { description: "Instrucciones actualizadas" }),
      ctx(),
    );
    expect(res!.status).toBe(200);
  });
});

describe("DELETE /api/admin/deliverables/[deliverableId]", () => {
  it("403 cuando no autoriza", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx());
    expect(res!.status).toBe(403);
  });

  it("200 y no llama a storage.remove cuando no hay entregas", async () => {
    state.submissionsResult = { data: [], error: null };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx());
    expect(res!.status).toBe(200);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("200 y no llama a storage.remove cuando las entregas no tienen storage_path", async () => {
    state.submissionsResult = {
      data: [{ storage_path: null }, { storage_path: null }],
      error: null,
    };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx());
    expect(res!.status).toBe(200);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("borra los archivos en Storage cuando hay entregas con storage_path", async () => {
    state.submissionsResult = {
      data: [{ storage_path: "a/1.pdf" }, { storage_path: "a/2.pdf" }],
      error: null,
    };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx());
    expect(res!.status).toBe(200);
    expect(removeSpy).toHaveBeenCalledWith(["a/1.pdf", "a/2.pdf"]);
  });

  it("continúa y borra el entregable aunque falle el remove de Storage", async () => {
    state.submissionsResult = { data: [{ storage_path: "a/1.pdf" }], error: null };
    removeSpy.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx());
    expect(res!.status).toBe(200);
  });

  it("500 cuando la DB falla al borrar el entregable", async () => {
    state.deleteResult = { error: { message: "boom" } };
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx());
    expect(res!.status).toBe(500);
  });

  it("200 elimina el entregable", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx());
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.ok).toBe(true);
  });
});
