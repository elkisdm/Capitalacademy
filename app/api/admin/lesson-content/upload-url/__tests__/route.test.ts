import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// ── Helpers ──────────────────────────────────────────────────

const LESSON_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/lesson-content/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(rawBody: string) {
  return new Request("http://localhost/api/admin/lesson-content/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    lessonId: LESSON_ID,
    filename: "imagen.png",
    contentType: "image/png",
    size: 1000,
    ...overrides,
  };
}

// ── Mutable mock state (leída en el momento por los mocks) ───

const mockState = {
  staffOk: true as boolean,

  // admin.storage.from(bucket).createSignedUploadUrl(path)
  signedResult: {
    data: { path: "signed/path", token: "signed-token" } as { path: string; token: string } | null,
    error: null as { message?: string } | null,
  },
  createSignedUploadUrlCalledWith: null as string | null,

  publicUrl: "https://cdn.example.com/lesson-content/signed/path",
};

// ── Auth (requireStaff) ────────────────────────────────────────

vi.mock("@/lib/auth/authorize-admin", () => ({
  requireStaff: vi.fn(async () => {
    if (!mockState.staffOk) {
      return {
        error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
      };
    }
    return { user: { id: "staff-1" } };
  }),
}));

// ── Cliente admin (createAdminClient) ─────────────────────────

const adminStorage = {
  from: (_bucket: string) => ({
    createSignedUploadUrl: (path: string) => {
      mockState.createSignedUploadUrlCalledWith = path;
      return Promise.resolve(mockState.signedResult);
    },
    getPublicUrl: (_path: string) => ({ data: { publicUrl: mockState.publicUrl } }),
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: adminStorage,
  }),
}));

// ── Import del handler (DESPUÉS de los mocks) ─────────────────

const { POST } = await import("@/app/api/admin/lesson-content/upload-url/route");

// ── Reset de estado antes de cada test ────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockState.staffOk = true;
  mockState.signedResult = {
    data: { path: "signed/path", token: "signed-token" },
    error: null,
  };
  mockState.createSignedUploadUrlCalledWith = null;
  mockState.publicUrl = "https://cdn.example.com/lesson-content/signed/path";
});

// ── POST ─────────────────────────────────────────────────────

describe("POST /api/admin/lesson-content/upload-url", () => {
  it("retorna el error de requireStaff si el usuario no es staff", async () => {
    mockState.staffOk = false;

    const res = await POST(makeRequest(validBody()));
    expect(res!.status).toBe(403);
    const json = await res!.json();
    expect(json.error).toBe("No autorizado");
  });

  it("retorna 400 si el body no es JSON válido", async () => {
    const res = await POST(makeRawRequest("{not json"));
    expect(res!.status).toBe(400);
    const json = await res!.json();
    expect(json.error).toBe("Body inválido");
  });

  it("retorna 422 si falta lessonId", async () => {
    const res = await POST(makeRequest({ filename: "imagen.png", contentType: "image/png", size: 1000 }));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("Validación fallida");
    expect(json.issues).toBeDefined();
  });

  it("retorna 422 si lessonId no tiene formato UUID", async () => {
    const res = await POST(makeRequest(validBody({ lessonId: "no-es-un-uuid" })));
    expect(res!.status).toBe(422);
  });

  it("retorna 422 si filename está vacío", async () => {
    const res = await POST(makeRequest(validBody({ filename: "   " })));
    expect(res!.status).toBe(422);
  });

  it("retorna 422 si filename supera los 255 caracteres", async () => {
    const res = await POST(makeRequest(validBody({ filename: "a".repeat(256) })));
    expect(res!.status).toBe(422);
  });

  it("retorna 422 si size no es positivo", async () => {
    const res = await POST(makeRequest(validBody({ size: 0 })));
    expect(res!.status).toBe(422);
  });

  it("retorna 422 si size no es entero", async () => {
    const res = await POST(makeRequest(validBody({ size: 12.5 })));
    expect(res!.status).toBe(422);
  });

  it("retorna 422 si size supera el máximo de 5 MB", async () => {
    const res = await POST(makeRequest(validBody({ size: 5 * 1024 * 1024 + 1 })));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.issues[0].message).toBe("La imagen no puede superar 5 MB");
  });

  it("retorna 422 si el contentType no está en la lista permitida", async () => {
    const res = await POST(makeRequest(validBody({ contentType: "application/pdf" })));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("Solo se permiten imágenes (JPG, PNG, WebP, GIF).");
  });

  it("acepta cada uno de los content-types permitidos (jpeg, png, webp, gif)", async () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      const res = await POST(makeRequest(validBody({ contentType })));
      expect(res!.status).toBe(200);
    }
  });

  it("retorna 500 si createSignedUploadUrl devuelve error", async () => {
    mockState.signedResult = { data: null, error: { message: "boom" } };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest(validBody()));
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toBe("No se pudo iniciar la subida");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("retorna 500 si createSignedUploadUrl no devuelve data aunque tampoco haya error", async () => {
    mockState.signedResult = { data: null, error: null };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest(validBody()));
    expect(res!.status).toBe(500);
    spy.mockRestore();
  });

  it("retorna 200 con path, token y publicUrl en el camino feliz", async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.path).toBe("signed/path");
    expect(json.token).toBe("signed-token");
    expect(json.publicUrl).toBe(mockState.publicUrl);
  });

  it("construye el path de storage con prefijo lessonId/<uuid>-filename saneado", async () => {
    await POST(makeRequest(validBody({ filename: "Mi Imagen Final (v2).png" })));

    expect(mockState.createSignedUploadUrlCalledWith).toMatch(
      new RegExp(`^${LESSON_ID}/[0-9a-f-]{36}-Mi-Imagen-Final-v2.png$`),
    );
  });

  it("usa 'imagen' como nombre cuando el filename saneado queda vacío", async () => {
    // Un filename compuesto solo de símbolos se limpia por completo y cae al fallback.
    await POST(makeRequest(validBody({ filename: "★彡★" })));

    expect(mockState.createSignedUploadUrlCalledWith).toMatch(
      new RegExp(`^${LESSON_ID}/[0-9a-f-]{36}-imagen$`),
    );
  });
});
