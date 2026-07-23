import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks de los bordes: authorizeAdmin, supabase server client y Mux ---

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data: unknown; error: unknown };

type State = {
  lessonRow: Record<string, unknown> | null;
  updateArgs: unknown[] | null;
  // lessons update({ mux_upload_id, mux_error }).eq(id).select("id")
  updateResult: Result;
};
let state: State;

function makeBuilder(table: string) {
  const ops: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  const chain = ["select", "update", "eq"];
  for (const m of chain) {
    builder[m] = (...args: unknown[]) => {
      ops.push([m, args]);
      if (m === "update" && table === "lessons") {
        state.updateArgs = args;
      }
      return builder;
    };
  }
  const has = (m: string) => ops.some(([mm]) => mm === m);
  const resolve = () => {
    if (table === "lessons") {
      if (has("update")) return state.updateResult;
      return { data: state.lessonRow, error: null };
    }
    return { data: null, error: null };
  };
  builder.single = () => Promise.resolve(resolve());
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: (table: string) => makeBuilder(table) })),
}));

const uploadsCreateMock = vi.fn();
vi.mock("@/lib/mux/client", () => ({
  getMuxClient: vi.fn(() => ({
    video: { uploads: { create: (...args: unknown[]) => uploadsCreateMock(...args) } },
  })),
}));

const { POST } = await import("@/app/api/admin/mux/upload/route");

const LESSON_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const ORIGINAL_SIGNING_KEY_ID = process.env.MUX_SIGNING_KEY_ID;

function jsonReq(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/admin/mux/upload", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function invalidJsonReq(): Request {
  return new Request("http://localhost/api/admin/mux/upload", {
    method: "POST",
    body: "{ esto no es json",
  });
}

describe("POST /api/admin/mux/upload", () => {
  beforeEach(() => {
    authResult = { user: { id: "admin-1" } };
    state = {
      lessonRow: { id: LESSON_ID, title: "Clase 1" },
      updateArgs: null,
      updateResult: { data: [{ id: LESSON_ID }], error: null },
    };
    uploadsCreateMock.mockReset();
    uploadsCreateMock.mockResolvedValue({
      id: "mux-upload-1",
      url: "https://storage.mux.com/upload-url",
    });
    delete process.env.MUX_SIGNING_KEY_ID;
  });

  afterEach(() => {
    if (ORIGINAL_SIGNING_KEY_ID === undefined) {
      delete process.env.MUX_SIGNING_KEY_ID;
    } else {
      process.env.MUX_SIGNING_KEY_ID = ORIGINAL_SIGNING_KEY_ID;
    }
  });

  it("devuelve el error de autorización cuando authorizeAdmin rechaza", async () => {
    authResult = {
      error: Response.json({ error: "No autorizado" }, { status: 403 }),
    };

    const res = await POST(jsonReq({ lessonId: LESSON_ID }));

    expect(res!.status).toBe(403);
    expect(uploadsCreateMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 si el body no es JSON válido", async () => {
    const res = await POST(invalidJsonReq());
    const body = await res!.json();

    expect(res!.status).toBe(400);
    expect(body).toEqual({ error: "Body inválido" });
    expect(uploadsCreateMock).not.toHaveBeenCalled();
  });

  it("devuelve 422 si falta lessonId", async () => {
    const res = await POST(jsonReq({}));
    const body = await res!.json();

    expect(res!.status).toBe(422);
    expect(body).toEqual({ error: "lessonId es requerido" });
    expect(uploadsCreateMock).not.toHaveBeenCalled();
  });

  it("devuelve 404 cuando la lección no existe", async () => {
    state.lessonRow = null;

    const res = await POST(jsonReq({ lessonId: LESSON_ID }));
    const body = await res!.json();

    expect(res!.status).toBe(404);
    expect(body).toEqual({ error: "Lección no encontrada" });
    expect(uploadsCreateMock).not.toHaveBeenCalled();
  });

  it("devuelve 502 cuando Mux uploads.create falla", async () => {
    uploadsCreateMock.mockRejectedValue(new Error("mux down"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(jsonReq({ lessonId: LESSON_ID }));
    const body = await res!.json();

    expect(res!.status).toBe(502);
    expect(body).toEqual({
      error: "No se pudo iniciar la subida a Mux. Intenta de nuevo.",
    });
    expect(state.updateArgs).toBeNull();

    consoleErrorSpy.mockRestore();
  });

  it("camino feliz: crea el upload con policy 'public' cuando no hay signing key y usa '*' sin header origin", async () => {
    const res = await POST(jsonReq({ lessonId: LESSON_ID }));
    const body = await res!.json();

    expect(res!.status).toBe(200);
    expect(body).toEqual({
      uploadUrl: "https://storage.mux.com/upload-url",
      uploadId: "mux-upload-1",
    });

    const [createArgs] = uploadsCreateMock.mock.calls[0];
    expect(createArgs.new_asset_settings.playback_policy).toEqual(["public"]);
    expect(createArgs.cors_origin).toBe("*");

    // Limpia mux_error previo y guarda el upload id en la lección.
    expect(state.updateArgs![0]).toEqual({
      mux_upload_id: "mux-upload-1",
      mux_error: null,
    });
  });

  it("usa policy 'signed' cuando MUX_SIGNING_KEY_ID está configurada", async () => {
    process.env.MUX_SIGNING_KEY_ID = "signing-key-id";

    const res = await POST(jsonReq({ lessonId: LESSON_ID }));
    expect(res!.status).toBe(200);

    const [createArgs] = uploadsCreateMock.mock.calls[0];
    expect(createArgs.new_asset_settings.playback_policy).toEqual(["signed"]);
  });

  it("usa el header 'origin' del request como cors_origin cuando está presente", async () => {
    const res = await POST(
      jsonReq({ lessonId: LESSON_ID }, { origin: "https://academia.capitalacademy.cl" }),
    );
    expect(res!.status).toBe(200);

    const [createArgs] = uploadsCreateMock.mock.calls[0];
    expect(createArgs.cors_origin).toBe("https://academia.capitalacademy.cl");
  });

  it("devuelve 500 sin uploadUrl si el UPDATE que enlaza mux_upload_id falla", async () => {
    state.updateResult = { data: null, error: { message: "db error" } };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(jsonReq({ lessonId: LESSON_ID }));
    const body = await res!.json();

    expect(res!.status).toBe(500);
    expect(body).toEqual({
      error: "No se pudo enlazar la subida con la lección. Intenta de nuevo.",
    });
    expect(body.uploadUrl).toBeUndefined();

    consoleErrorSpy.mockRestore();
  });

  it("devuelve 500 sin uploadUrl si el UPDATE no afecta ninguna fila (sin error explícito)", async () => {
    state.updateResult = { data: [], error: null };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(jsonReq({ lessonId: LESSON_ID }));
    const body = await res!.json();

    expect(res!.status).toBe(500);
    expect(body).toEqual({
      error: "No se pudo enlazar la subida con la lección. Intenta de nuevo.",
    });

    consoleErrorSpy.mockRestore();
  });
});
