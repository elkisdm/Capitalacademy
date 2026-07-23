import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const DELIVERABLE_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const USER_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567891";
const FAKE_USER = { id: USER_ID };

function storagePathFor(filename: string) {
  return `${DELIVERABLE_ID}/${USER_ID}/${filename}`;
}

const CREATED_ROW = {
  id: "c1c2c3c4-e5f6-7890-abcd-ef1234567892",
  deliverable_id: DELIVERABLE_ID,
  student_id: USER_ID,
  storage_path: storagePathFor("archivo.pdf"),
  filename: "archivo.pdf",
  content_type: null,
  file_size_bytes: 1000,
  uploaded_at: "2026-07-20T10:00:00.000Z",
};

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/classroom/deliverables", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRawPostRequest(rawBody: string) {
  return new Request("http://localhost/api/classroom/deliverables", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

function makeDeleteRequest(id?: string) {
  const url = new URL("http://localhost/api/classroom/deliverables");
  if (id !== undefined) url.searchParams.set("id", id);
  return new Request(url.toString(), { method: "DELETE" });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    deliverableId: DELIVERABLE_ID,
    storagePath: storagePathFor("archivo.pdf"),
    filename: "archivo.pdf",
    ...overrides,
  };
}

// ── Mutable mock state (leída en el momento por los mocks) ───

const mockState = {
  user: FAKE_USER as { id: string } | null,

  // admin.storage.from(bucket).list()
  storageList: [{ name: "archivo.pdf", metadata: { size: 1000 } as { size?: number } }] as Array<{
    name: string;
    metadata?: { size?: number };
  }>,

  // admin.from("deliverables").select().eq().single()
  deliverableRow: {
    title: "Entregable de prueba",
    program_id: "prog1111-1111-1111-1111-111111111111",
    allow_multiple: true,
    max_file_size_bytes: 10_000_000,
    allowed_file_types: ["pdf"],
  } as Record<string, unknown> | null,

  // admin.from("deliverable_submissions").select()...neq() → candidatos a fila obsoleta
  pairRows: [] as Array<{ id: string; storage_path: string; uploaded_at: string }>,
  staleDeleteCalledWith: null as string[] | null,

  // admin.from("profiles").select().eq().single()
  profileRow: { full_name: "Alumno Test", email: "alumno@test.cl" } as Record<
    string,
    unknown
  > | null,
  profileThrows: false,

  // admin.from("programs").select().eq().single()
  programRow: { name: "Programa Test" } as Record<string, unknown> | null,

  // supabase.from("deliverable_submissions").insert().select().single()
  insertResult: {
    data: null as Record<string, unknown> | null,
    error: null as { code?: string; message?: string } | null,
  },

  // supabase.from("deliverable_submissions").delete().eq().select()  (handler DELETE)
  deleteResult: {
    data: null as Array<{ id: string; storage_path: string | null }> | null,
    error: null as { message?: string } | null,
  },

  // admin.storage...remove()
  removeError: null as { message?: string } | null,
  removeCalledWith: null as string[] | null,

  // resolveDeliverableUrls -> admin.storage...createSignedUrls()
  signedUrlsError: null as { message?: string } | null,
};

// ── Cliente admin (createAdminClient) ─────────────────────────

function adminFrom(table: string) {
  if (table === "deliverables") {
    return {
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({ data: mockState.deliverableRow, error: null }),
        }),
      }),
    };
  }
  if (table === "profiles") {
    return {
      select: () => ({
        eq: () => ({
          single: () => {
            if (mockState.profileThrows) {
              return Promise.reject(new Error("boom profiles"));
            }
            return Promise.resolve({ data: mockState.profileRow, error: null });
          },
        }),
      }),
    };
  }
  if (table === "programs") {
    return {
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({ data: mockState.programRow, error: null }),
        }),
      }),
    };
  }
  if (table === "deliverable_submissions") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            neq: () =>
              Promise.resolve({ data: mockState.pairRows, error: null }),
          }),
        }),
      }),
      delete: () => ({
        in: (_col: string, ids: string[]) => {
          mockState.staleDeleteCalledWith = ids;
          return Promise.resolve({ data: null, error: null });
        },
      }),
    };
  }
  throw new Error(`tabla admin no mockeada: ${table}`);
}

const adminStorage = {
  from: (_bucket: string) => ({
    list: (_dir: string, _opts: unknown) =>
      Promise.resolve({ data: mockState.storageList, error: null }),
    remove: (paths: string[]) => {
      mockState.removeCalledWith = paths;
      return Promise.resolve({ error: mockState.removeError });
    },
    createSignedUrls: (paths: string[], _expiry: number, _opts: unknown) => {
      if (mockState.signedUrlsError) {
        return Promise.resolve({ data: null, error: mockState.signedUrlsError });
      }
      return Promise.resolve({
        data: paths.map((p) => ({ path: p, signedUrl: `https://signed.test/${p}` })),
        error: null,
      });
    },
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: adminFrom,
    storage: adminStorage,
  }),
}));

// ── Cliente de usuario (createClient, usado por getAuthUser también) ──

function userFrom(table: string) {
  if (table !== "deliverable_submissions") {
    throw new Error(`tabla user no mockeada: ${table}`);
  }
  return {
    insert: (_row: Record<string, unknown>) => ({
      select: () => ({
        single: () => Promise.resolve(mockState.insertResult),
      }),
    }),
    delete: () => ({
      eq: (_col: string, _val: string) => ({
        select: (_cols: string) => Promise.resolve(mockState.deleteResult),
      }),
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: mockState.user } }) },
    from: userFrom,
  }),
}));

// ── Envío de correo de confirmación ───────────────────────────

const mockSendEmail = vi.fn(async (..._args: unknown[]) => ({ success: true, error: undefined as string | undefined }));
vi.mock("@/lib/email/deliverable-received", () => ({
  sendDeliverableReceivedEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

// ── Import de los handlers (DESPUÉS de los mocks) ─────────────

const { POST, DELETE } = await import("@/app/api/classroom/deliverables/route");

// ── Reset de estado antes de cada test ────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockState.user = FAKE_USER;
  mockState.storageList = [{ name: "archivo.pdf", metadata: { size: 1000 } }];
  mockState.deliverableRow = {
    title: "Entregable de prueba",
    program_id: "prog1111-1111-1111-1111-111111111111",
    allow_multiple: true,
    max_file_size_bytes: 10_000_000,
    allowed_file_types: ["pdf"],
  };
  mockState.pairRows = [];
  mockState.staleDeleteCalledWith = null;
  mockState.profileRow = { full_name: "Alumno Test", email: "alumno@test.cl" };
  mockState.profileThrows = false;
  mockState.programRow = { name: "Programa Test" };
  mockState.insertResult = { data: { ...CREATED_ROW }, error: null };
  mockState.deleteResult = { data: null, error: null };
  mockState.removeError = null;
  mockState.removeCalledWith = null;
  mockState.signedUrlsError = null;
  mockSendEmail.mockResolvedValue({ success: true, error: undefined });
});

// ── POST ─────────────────────────────────────────────────────

describe("POST /api/classroom/deliverables", () => {
  it("retorna 401 si no hay usuario autenticado", async () => {
    mockState.user = null;

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("retorna 400 si el body no es JSON válido", async () => {
    const res = await POST(makeRawPostRequest("{not json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("retorna 422 si la validación de zod falla (falta deliverableId)", async () => {
    const res = await POST(makePostRequest({ storagePath: "x", filename: "a.pdf" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
    expect(json.issues).toBeDefined();
  });

  it("retorna 422 si storagePath no pertenece a este entregable/alumno", async () => {
    const res = await POST(
      makePostRequest(validBody({ storagePath: `${DELIVERABLE_ID}/otro-alumno/archivo.pdf` })),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/storagePath/);
  });

  it("retorna 422 si el archivo no se encuentra en Storage", async () => {
    mockState.storageList = [];

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/no se encontró/);
  });

  it("retorna 404 si el entregable no existe", async () => {
    mockState.deliverableRow = null;

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/no encontrado/);
  });

  it("retorna 422 si el tamaño REAL del objeto en Storage supera el máximo", async () => {
    mockState.storageList = [{ name: "archivo.pdf", metadata: { size: 99_000_000 } }];
    (mockState.deliverableRow as Record<string, unknown>).max_file_size_bytes = 10_000_000;

    const res = await POST(makePostRequest(validBody({ fileSizeBytes: 1 })));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/tamaño máximo/);
  });

  it("usa fileSizeBytes declarado como fallback cuando Storage no reporta tamaño, y lo valida", async () => {
    mockState.storageList = [{ name: "archivo.pdf", metadata: {} }];
    (mockState.deliverableRow as Record<string, unknown>).max_file_size_bytes = 10_000_000;

    const res = await POST(makePostRequest(validBody({ fileSizeBytes: 99_000_000 })));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/tamaño máximo/);
  });

  it("retorna 422 si el filename declarado tiene una extensión no permitida", async () => {
    // storagePath/objeto real en Storage sí tienen extensión permitida (.pdf);
    // solo el filename de display declara una extensión prohibida.
    const res = await POST(
      makePostRequest(validBody({ filename: "malicioso.exe" })),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/Tipo de archivo/);
  });

  it("retorna 422 si el objeto real subido a Storage tiene una extensión no permitida", async () => {
    // El filename declarado es .pdf (permitido) pero el archivo real subido es .exe.
    mockState.storageList = [{ name: "archivo.exe", metadata: { size: 1000 } }];

    const res = await POST(
      makePostRequest(
        validBody({ storagePath: storagePathFor("archivo.exe"), filename: "archivo.pdf" }),
      ),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/Tipo de archivo/);
  });

  it("retorna 403 cuando el insert falla por RLS (ventana de entrega cerrada, code 42501)", async () => {
    mockState.insertResult = { data: null, error: { code: "42501" } };

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/ventana de entrega/);
  });

  it("retorna 500 cuando el insert falla por otra razón", async () => {
    mockState.insertResult = { data: null, error: { code: "23505", message: "duplicate" } };

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/Error al guardar/);
  });

  it("retorna 201 en el camino feliz con allow_multiple=true y no intenta limpiar filas viejas", async () => {
    (mockState.deliverableRow as Record<string, unknown>).allow_multiple = true;

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe(CREATED_ROW.id);
    expect(json.signedUrl).toBe(`https://signed.test/${CREATED_ROW.storage_path}`);
    expect(mockState.staleDeleteCalledWith).toBeNull();
  });

  it("con allow_multiple=false y sin filas previas, no borra nada", async () => {
    (mockState.deliverableRow as Record<string, unknown>).allow_multiple = false;
    mockState.pairRows = [];

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(201);
    expect(mockState.staleDeleteCalledWith).toBeNull();
    expect(mockState.removeCalledWith).toBeNull();
  });

  it("con allow_multiple=false, borra únicamente las filas ESTRICTAMENTE más viejas que la recién creada", async () => {
    (mockState.deliverableRow as Record<string, unknown>).allow_multiple = false;
    mockState.pairRows = [
      {
        id: "d0000000-0000-0000-0000-000000000001",
        storage_path: storagePathFor("viejo.pdf"),
        uploaded_at: "2026-07-19T10:00:00.000Z", // anterior a CREATED_ROW.uploaded_at
      },
    ];

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(201);
    expect(mockState.staleDeleteCalledWith).toEqual(["d0000000-0000-0000-0000-000000000001"]);
    expect(mockState.removeCalledWith).toEqual([storagePathFor("viejo.pdf")]);
  });

  it("con uploaded_at empatado, desempata de forma determinista por id (solo el id menor se borra)", async () => {
    (mockState.deliverableRow as Record<string, unknown>).allow_multiple = false;
    mockState.pairRows = [
      {
        id: "a0000000-0000-0000-0000-000000000001", // menor que CREATED_ROW.id → obsoleta
        storage_path: storagePathFor("empate-menor.pdf"),
        uploaded_at: CREATED_ROW.uploaded_at,
      },
      {
        id: "z0000000-0000-0000-0000-000000000001", // mayor que CREATED_ROW.id → sobrevive
        storage_path: storagePathFor("empate-mayor.pdf"),
        uploaded_at: CREATED_ROW.uploaded_at,
      },
    ];

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(201);
    expect(mockState.staleDeleteCalledWith).toEqual(["a0000000-0000-0000-0000-000000000001"]);
    expect(mockState.removeCalledWith).toEqual([storagePathFor("empate-menor.pdf")]);
  });

  it("envía el correo de confirmación cuando el perfil tiene email", async () => {
    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(201);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alumno@test.cl",
        deliverableTitle: "Entregable de prueba",
        programName: "Programa Test",
      }),
    );
  });

  it("no envía correo si el perfil no tiene email, pero igual retorna 201", async () => {
    mockState.profileRow = { full_name: "Alumno Test", email: null };

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(201);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("tolera que el envío de correo falle (success:false) y retorna 201 igual", async () => {
    mockSendEmail.mockResolvedValue({ success: false, error: "resend down" });

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(201);
  });

  it("tolera que el flujo de correo lance una excepción y retorna 201 igual", async () => {
    mockState.profileThrows = true;

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(201);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("si la firma de la URL de descarga falla, retorna 201 con signedUrl null", async () => {
    mockState.signedUrlsError = { message: "boom signing" };

    const res = await POST(makePostRequest(validBody()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.signedUrl).toBeNull();
  });
});

// ── DELETE ───────────────────────────────────────────────────

describe("DELETE /api/classroom/deliverables", () => {
  it("retorna 401 si no hay usuario autenticado", async () => {
    mockState.user = null;

    const res = await DELETE(makeDeleteRequest(CREATED_ROW.id));
    expect(res.status).toBe(401);
  });

  it("retorna 422 si falta el id", async () => {
    const res = await DELETE(makeDeleteRequest());
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/id inválido/);
  });

  it("retorna 422 si el id no tiene formato UUID", async () => {
    const res = await DELETE(makeDeleteRequest("no-es-un-uuid"));
    expect(res.status).toBe(422);
  });

  it("retorna 500 si el delete en la base de datos falla", async () => {
    mockState.deleteResult = { data: null, error: { message: "db down" } };

    const res = await DELETE(makeDeleteRequest(CREATED_ROW.id));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/Error al eliminar/);
  });

  it("retorna 404 si no se borró ninguna fila (ajena o inexistente)", async () => {
    mockState.deleteResult = { data: [], error: null };

    const res = await DELETE(makeDeleteRequest(CREATED_ROW.id));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/no encontrada/);
  });

  it("retorna 200 y borra el archivo de Storage en el camino feliz", async () => {
    mockState.deleteResult = {
      data: [{ id: CREATED_ROW.id, storage_path: CREATED_ROW.storage_path }],
      error: null,
    };

    const res = await DELETE(makeDeleteRequest(CREATED_ROW.id));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
    expect(mockState.removeCalledWith).toEqual([CREATED_ROW.storage_path]);
  });

  it("retorna 200 aunque falle el borrado en Storage (no rompe la respuesta)", async () => {
    mockState.deleteResult = {
      data: [{ id: CREATED_ROW.id, storage_path: CREATED_ROW.storage_path }],
      error: null,
    };
    mockState.removeError = { message: "storage down" };

    const res = await DELETE(makeDeleteRequest(CREATED_ROW.id));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
  });

  it("retorna 200 sin intentar borrar en Storage si la fila no tiene storage_path", async () => {
    mockState.deleteResult = {
      data: [{ id: CREATED_ROW.id, storage_path: null }],
      error: null,
    };

    const res = await DELETE(makeDeleteRequest(CREATED_ROW.id));
    expect(res.status).toBe(200);
    expect(mockState.removeCalledWith).toBeNull();
  });
});
