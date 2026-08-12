import { describe, it, expect, vi, beforeEach } from "vitest";

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result<T = unknown> = { data: T; error: unknown };

type State = {
  existing: Result<{ id: string } | null>;
  uploadError: unknown;
  listFiles: Array<{ name: string }> | null;
  updated: Result<Array<{ id: string }> | null>;
};
let state: State;

const uploadSpy = vi.fn(async () => ({ error: state.uploadError }));
const removeSpy = vi.fn(async () => ({ data: [], error: null }));
const listSpy = vi.fn(async () => ({ data: state.listFiles, error: null }));

function makeBuilder(table: string) {
  const ops: Array<[string, unknown[]]> = [];
  const chain = ["select", "update", "eq"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = (...args: unknown[]) => {
      ops.push([m, args]);
      return builder;
    };
  }
  const has = (m: string) => ops.some(([mm]) => mm === m);
  builder.single = () => Promise.resolve(state.existing);
  // update(...).eq(...).select(...) → resuelve como thenable al final de la cadena.
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
    if (has("update")) return Promise.resolve(state.updated).then(res, rej);
    return Promise.resolve({ data: null, error: null }).then(res, rej);
  };
  void table;
  return builder;
}

// Registra la tabla contra la que se escribe: cada target apunta a una distinta
// y es lo único que distingue a "session" de "lesson" en la ruta.
const fromSpy = vi.fn((table: string) => makeBuilder(table));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: fromSpy,
    storage: {
      from: () => ({
        upload: uploadSpy,
        list: listSpy,
        remove: removeSpy,
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://storage.test/covers/${path}` },
        }),
      }),
    },
  })),
}));

// Cast: TS no logra descartar `undefined` en el retorno de authorizeAdmin()
// tras el narrowing `"error" in auth` (el otro miembro del union declara
// `error?: never`), así que el tipo inferido de POST/DELETE arrastra
// `| undefined` aunque en runtime siempre devuelven Response.
const routeModule = await import("@/app/api/admin/covers/route");
const POST = routeModule.POST as (req: Request) => Promise<Response>;
const DELETE = routeModule.DELETE as (req: Request) => Promise<Response>;

const MODULE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";

function makeFile(opts?: { type?: string; size?: number }) {
  const type = opts?.type ?? "image/png";
  const size = opts?.size ?? 100;
  return new File([new Uint8Array(size)], "cover.png", { type });
}

function postReq(fields: Record<string, string | File | null | undefined>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    fd.append(k, v);
  }
  return new Request("http://localhost/api/admin/covers", { method: "POST", body: fd });
}

function delReq(target?: string, id?: string) {
  const params = new URLSearchParams();
  if (target) params.set("target", target);
  if (id) params.set("id", id);
  return new Request(`http://localhost/api/admin/covers?${params.toString()}`, {
    method: "DELETE",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authResult = { user: { id: "admin-1" } };
  state = {
    existing: { data: { id: MODULE_ID }, error: null },
    uploadError: null,
    listFiles: [{ name: "cover.png" }],
    updated: { data: [{ id: MODULE_ID }], error: null },
  };
});

describe("POST /api/admin/covers", () => {
  it("propaga el error de authorizeAdmin (401/403) sin tocar Storage", async () => {
    authResult = { error: Response.json({ error: "No autenticado" }, { status: 401 }) as unknown as Response };
    const res = await POST(postReq({ file: makeFile(), target: "module", id: MODULE_ID }));
    expect((res as Response).status).toBe(401);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("400 cuando no se envía archivo", async () => {
    const res = await POST(postReq({ target: "module", id: MODULE_ID }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("No se recibió archivo");
  });

  it("400 cuando target no es module, lesson ni session", async () => {
    const res = await POST(postReq({ file: makeFile(), target: "curso", id: MODULE_ID }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("target inválido");
  });

  it("400 cuando falta id", async () => {
    const res = await POST(postReq({ file: makeFile(), target: "module" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("id inválido");
  });

  it("400 cuando id no tiene forma de UUID", async () => {
    const res = await POST(postReq({ file: makeFile(), target: "module", id: "no-es-uuid" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("id inválido");
  });

  it("422 cuando el tipo de archivo no está permitido", async () => {
    const res = await POST(
      postReq({ file: makeFile({ type: "image/gif" }), target: "module", id: MODULE_ID }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Formato no permitido. Usa JPG, PNG o WebP.");
  });

  it("422 cuando el archivo supera 2 MB", async () => {
    const res = await POST(
      postReq({ file: makeFile({ size: 2 * 1024 * 1024 + 1 }), target: "module", id: MODULE_ID }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("La imagen no puede superar 2 MB.");
  });

  it("404 cuando el registro (módulo/lección) no existe", async () => {
    state.existing = { data: null, error: null };
    const res = await POST(postReq({ file: makeFile(), target: "module", id: MODULE_ID }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Registro no encontrado");
  });

  it("500 cuando Storage falla al subir", async () => {
    state.uploadError = { message: "boom" };
    const res = await POST(postReq({ file: makeFile(), target: "module", id: MODULE_ID }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al subir la imagen");
  });

  it("500 cuando la subida ok pero la actualización del registro falla", async () => {
    state.updated = { data: null, error: { message: "db down" } };
    const res = await POST(postReq({ file: makeFile(), target: "module", id: MODULE_ID }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Imagen subida pero no se pudo actualizar el registro");
  });

  it("500 cuando update() no afecta ninguna fila (updated.length === 0)", async () => {
    state.updated = { data: [], error: null };
    const res = await POST(postReq({ file: makeFile(), target: "module", id: MODULE_ID }));
    expect(res.status).toBe(500);
  });

  it("200 sube la portada de un módulo, mapea image/png → .png y limpia extensiones huérfanas", async () => {
    // cover.jpg queda de una subida anterior con otra extensión: debe limpiarse.
    state.listFiles = [{ name: "cover.png" }, { name: "cover.jpg" }];
    const res = await POST(postReq({ file: makeFile({ type: "image/png" }), target: "module", id: MODULE_ID }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cover_image_url).toMatch(
      /^https:\/\/storage\.test\/covers\/module\/aaaaaaaa-bbbb-4ccc-8ddd-111111111111\/cover\.png\?v=\d+$/,
    );
    expect(uploadSpy).toHaveBeenCalledWith(
      `module/${MODULE_ID}/cover.png`,
      expect.anything(),
      expect.objectContaining({ upsert: true, contentType: "image/png" }),
    );
    // Solo el archivo huérfano (extensión distinta) se elimina, no el recién subido.
    expect(removeSpy).toHaveBeenCalledWith([`module/${MODULE_ID}/cover.jpg`]);
  });

  it("200 sube la portada de una lección y mapea image/jpeg → .jpg", async () => {
    state.listFiles = [{ name: "cover.jpg" }];
    const res = await POST(
      postReq({ file: makeFile({ type: "image/jpeg" }), target: "lesson", id: MODULE_ID }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cover_image_url).toContain(`lesson/${MODULE_ID}/cover.jpg`);
    // Único archivo en Storage coincide con el recién subido: no hay huérfanos que borrar.
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("200 sube la portada de una clase en vivo y escribe en class_sessions", async () => {
    state.listFiles = [{ name: "cover.png" }];
    const res = await POST(
      postReq({ file: makeFile({ type: "image/png" }), target: "session", id: MODULE_ID }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cover_image_url).toContain(`session/${MODULE_ID}/cover.png`);
    expect(uploadSpy).toHaveBeenCalledWith(
      `session/${MODULE_ID}/cover.png`,
      expect.anything(),
      expect.objectContaining({ upsert: true, contentType: "image/png" }),
    );
    expect(fromSpy).toHaveBeenCalledWith("class_sessions");
    expect(fromSpy).not.toHaveBeenCalledWith("lessons");
  });

  it("aplica las mismas validaciones al target session (422 por formato)", async () => {
    const res = await POST(
      postReq({ file: makeFile({ type: "image/gif" }), target: "session", id: MODULE_ID }),
    );
    expect(res.status).toBe(422);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("404 cuando la clase en vivo no existe", async () => {
    state.existing = { data: null, error: null };
    const res = await POST(postReq({ file: makeFile(), target: "session", id: MODULE_ID }));
    expect(res.status).toBe(404);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("200 sin huérfanos cuando list() no devuelve archivos (staleFiles null)", async () => {
    state.listFiles = null;
    const res = await POST(postReq({ file: makeFile({ type: "image/webp" }), target: "module", id: MODULE_ID }));
    expect(res.status).toBe(200);
    expect(removeSpy).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/covers", () => {
  it("propaga el error de authorizeAdmin sin tocar Storage", async () => {
    authResult = { error: Response.json({ error: "No autorizado" }, { status: 403 }) as unknown as Response };
    const res = await DELETE(delReq("module", MODULE_ID));
    expect((res as Response).status).toBe(403);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("400 cuando target no es module, lesson ni session", async () => {
    const res = await DELETE(delReq("curso", MODULE_ID));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("target inválido");
  });

  it("400 cuando falta id", async () => {
    const res = await DELETE(delReq("module"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("id es requerido");
  });

  it("200 borra los archivos existentes en Storage y limpia cover_image_url", async () => {
    state.listFiles = [{ name: "cover.png" }];
    const res = await DELETE(delReq("module", MODULE_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cover_image_url).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith([`module/${MODULE_ID}/cover.png`]);
  });

  it("200 sin llamar remove() cuando no hay archivos en Storage", async () => {
    state.listFiles = [];
    const res = await DELETE(delReq("lesson", MODULE_ID));
    expect(res.status).toBe(200);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("200 borra la portada de una clase en vivo y limpia class_sessions", async () => {
    state.listFiles = [{ name: "cover.webp" }];
    const res = await DELETE(delReq("session", MODULE_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cover_image_url).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith([`session/${MODULE_ID}/cover.webp`]);
    expect(fromSpy).toHaveBeenCalledWith("class_sessions");
  });

  it("200 sin llamar remove() cuando list() devuelve null", async () => {
    state.listFiles = null;
    const res = await DELETE(delReq("lesson", MODULE_ID));
    expect(res.status).toBe(200);
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
