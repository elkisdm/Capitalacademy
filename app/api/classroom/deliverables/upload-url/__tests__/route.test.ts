import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const DELIVERABLE_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const USER_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567891";
const PROGRAM_ID = "c1c2c3c4-e5f6-7890-abcd-ef1234567892";
const FAKE_USER = { id: USER_ID };

const ONE_HOUR_MS = 60 * 60 * 1000;

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/classroom/deliverables/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRawRequest(rawBody: string) {
  return new Request("http://localhost/api/classroom/deliverables/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    deliverableId: DELIVERABLE_ID,
    filename: "archivo.pdf",
    size: 1000,
    ...overrides,
  };
}

// ── Mutable mock state (leída en el momento por los mocks) ───

const mockState = {
  user: FAKE_USER as { id: string } | null,

  // admin.from("deliverables").select().eq().single()
  deliverableRow: {
    opens_at: new Date(Date.now() - ONE_HOUR_MS).toISOString(),
    due_at: new Date(Date.now() + ONE_HOUR_MS).toISOString(),
    program_id: PROGRAM_ID,
    allowed_file_types: ["pdf"],
    max_file_size_bytes: 10_000_000,
  } as Record<string, unknown> | null,

  // admin.from("enrollments").select().eq().eq().eq().limit().maybeSingle()
  enrollmentRow: { id: "d1d2d3d4-e5f6-7890-abcd-ef1234567893" } as Record<string, unknown> | null,

  // admin.storage.from(bucket).createSignedUploadUrl(path)
  signedResult: {
    data: { path: "signed/path", token: "signed-token" } as { path: string; token: string } | null,
    error: null as { message?: string } | null,
  },
  createSignedUploadUrlCalledWith: null as string | null,
};

// ── Cliente admin (createAdminClient) ─────────────────────────

function adminFrom(table: string) {
  if (table === "deliverables") {
    return {
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: mockState.deliverableRow, error: null }),
        }),
      }),
    };
  }
  if (table === "enrollments") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: mockState.enrollmentRow, error: null }),
              }),
            }),
          }),
        }),
      }),
    };
  }
  throw new Error(`tabla admin no mockeada: ${table}`);
}

const adminStorage = {
  from: (_bucket: string) => ({
    createSignedUploadUrl: (path: string) => {
      mockState.createSignedUploadUrlCalledWith = path;
      return Promise.resolve(mockState.signedResult);
    },
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: adminFrom,
    storage: adminStorage,
  }),
}));

// ── Usuario autenticado (getAuthUser) ─────────────────────────

vi.mock("@/lib/supabase/auth", () => ({
  getAuthUser: () => Promise.resolve({ data: { user: mockState.user } }),
}));

// ── Import del handler (DESPUÉS de los mocks) ─────────────────

const { POST } = await import("@/app/api/classroom/deliverables/upload-url/route");

// ── Reset de estado antes de cada test ────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockState.user = FAKE_USER;
  mockState.deliverableRow = {
    opens_at: new Date(Date.now() - ONE_HOUR_MS).toISOString(),
    due_at: new Date(Date.now() + ONE_HOUR_MS).toISOString(),
    program_id: PROGRAM_ID,
    allowed_file_types: ["pdf"],
    max_file_size_bytes: 10_000_000,
  };
  mockState.enrollmentRow = { id: "d1d2d3d4-e5f6-7890-abcd-ef1234567893" };
  mockState.signedResult = {
    data: { path: "signed/path", token: "signed-token" },
    error: null,
  };
  mockState.createSignedUploadUrlCalledWith = null;
});

// ── POST ─────────────────────────────────────────────────────

describe("POST /api/classroom/deliverables/upload-url", () => {
  it("retorna 401 si no hay usuario autenticado", async () => {
    mockState.user = null;

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
  });

  it("retorna 400 si el body no es JSON válido", async () => {
    const res = await POST(makeRawRequest("{not json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Body inválido");
  });

  it("retorna 422 si falta deliverableId", async () => {
    const res = await POST(makeRequest({ filename: "archivo.pdf", size: 1000 }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
    expect(json.issues).toBeDefined();
  });

  it("retorna 422 si deliverableId no tiene formato UUID", async () => {
    const res = await POST(makeRequest(validBody({ deliverableId: "no-es-un-uuid" })));
    expect(res.status).toBe(422);
  });

  it("retorna 422 si filename está vacío", async () => {
    const res = await POST(makeRequest(validBody({ filename: "   " })));
    expect(res.status).toBe(422);
  });

  it("retorna 422 si size no es positivo", async () => {
    const res = await POST(makeRequest(validBody({ size: 0 })));
    expect(res.status).toBe(422);
  });

  it("retorna 422 si size no es entero", async () => {
    const res = await POST(makeRequest(validBody({ size: 12.5 })));
    expect(res.status).toBe(422);
  });

  it("retorna 404 si el entregable no existe", async () => {
    mockState.deliverableRow = null;

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Entregable no encontrado");
  });

  it("retorna 403 si la ventana de entrega todavía no abre", async () => {
    (mockState.deliverableRow as Record<string, unknown>).opens_at = new Date(
      Date.now() + ONE_HOUR_MS,
    ).toISOString();

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("La ventana de entrega no está abierta");
  });

  it("retorna 403 si la ventana de entrega ya cerró", async () => {
    (mockState.deliverableRow as Record<string, unknown>).due_at = new Date(
      Date.now() - ONE_HOUR_MS,
    ).toISOString();

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("La ventana de entrega no está abierta");
  });

  it("retorna 403 si el alumno no tiene matrícula activa en el programa", async () => {
    mockState.enrollmentRow = null;

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("No tienes matrícula activa en este programa");
  });

  it("retorna 422 si la extensión del archivo no está permitida", async () => {
    const res = await POST(makeRequest(validBody({ filename: "malicioso.exe" })));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Tipo de archivo no permitido para este entregable");
  });

  it("retorna 422 si el filename declarado no tiene extensión", async () => {
    const res = await POST(makeRequest(validBody({ filename: "sin-extension" })));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Tipo de archivo no permitido para este entregable");
  });

  it("retorna 422 si el tamaño declarado supera el máximo permitido", async () => {
    (mockState.deliverableRow as Record<string, unknown>).max_file_size_bytes = 1000;

    const res = await POST(makeRequest(validBody({ size: 1001 })));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("El archivo supera el tamaño máximo permitido");
  });

  it("retorna 500 si createSignedUploadUrl devuelve error", async () => {
    mockState.signedResult = { data: null, error: { message: "boom" } };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No se pudo iniciar la subida");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("retorna 500 si createSignedUploadUrl no devuelve data aunque tampoco haya error", async () => {
    mockState.signedResult = { data: null, error: null };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
    spy.mockRestore();
  });

  it("retorna 200 con path y token en el camino feliz", async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toBe("signed/path");
    expect(json.token).toBe("signed-token");
  });

  it("construye el path de storage con prefijo deliverableId/userId (student-scoped)", async () => {
    await POST(makeRequest(validBody({ filename: "Mi Archivo Final (v2).pdf" })));

    expect(mockState.createSignedUploadUrlCalledWith).toMatch(
      new RegExp(`^${DELIVERABLE_ID}/${USER_ID}/`),
    );
    // El nombre se sanitiza: espacios -> guiones, paréntesis removidos.
    expect(mockState.createSignedUploadUrlCalledWith).toMatch(/Mi-Archivo-Final-v2.pdf$/);
  });
});
