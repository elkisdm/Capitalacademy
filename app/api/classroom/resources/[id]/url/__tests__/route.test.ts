import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const RESOURCE_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const USER_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567891";
const LESSON_ID = "c1c2c3c4-e5f6-7890-abcd-ef1234567892";
const PROGRAM_ID = "d1d2d3d4-e5f6-7890-abcd-ef1234567893";
const SESSION_ID = "e1e2e3e4-e5f6-7890-abcd-ef1234567894";
const COHORT_ID = "f1f2f3f4-e5f6-7890-abcd-ef1234567895";
const FAKE_USER = { id: USER_ID };

function makeRequest(id: string, table?: string | null) {
  const url = new URL(`http://localhost/api/classroom/resources/${id}/url`);
  if (table !== undefined && table !== null) url.searchParams.set("table", table);
  return new Request(url.toString());
}

function ctxFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ── Estado mutable leído por los mocks ──────────────────────────

const mockState = {
  user: FAKE_USER as { id: string } | null,

  // admin.from("lesson_resources").select().eq().maybeSingle()
  lessonResourceRow: {
    id: RESOURCE_ID,
    lesson_id: LESSON_ID,
    url: "https://externo.test/archivo.pdf",
    storage_path: "lesson/archivo.pdf",
    type: "pdf",
  } as Record<string, unknown> | null,

  // admin.from("lessons").select().eq().single()
  lessonRow: {
    id: LESSON_ID,
    program_modules: { program_id: PROGRAM_ID },
  } as Record<string, unknown> | null,

  // resolveViewerCohortForProgram(userId, programId)
  viewerCohort: { id: COHORT_ID, slug: "g1" } as { id: string; slug: string } | null,

  // admin.from("session_resources").select().eq().maybeSingle()
  sessionResourceRow: {
    id: RESOURCE_ID,
    session_id: SESSION_ID,
    url: "https://externo.test/sesion.pdf",
    storage_path: "session/archivo.pdf",
    type: "pdf",
  } as Record<string, unknown> | null,

  // admin.from("class_sessions").select().eq().single()
  classSessionRow: { cohort_id: COHORT_ID } as Record<string, unknown> | null,

  // getClassroomAccess(userId, cohortId)
  classroomAccess: { enrollment: null, isStaff: true } as unknown,

  // admin.storage.from(bucket).createSignedUrl(path, expiry)
  signedUrlResult: {
    data: { signedUrl: "https://signed.test/archivo.pdf?token=abc" } as { signedUrl: string } | null,
    error: null as { message?: string } | null,
  },
  createSignedUrlCalledWith: null as [string, number] | null,
};

// ── Cliente admin (createAdminClient) ─────────────────────────

function adminFrom(table: string) {
  if (table === "lesson_resources") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: mockState.lessonResourceRow, error: null }),
        }),
      }),
    };
  }
  if (table === "lessons") {
    return {
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: mockState.lessonRow, error: null }),
        }),
      }),
    };
  }
  if (table === "session_resources") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: mockState.sessionResourceRow, error: null }),
        }),
      }),
    };
  }
  if (table === "class_sessions") {
    return {
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: mockState.classSessionRow, error: null }),
        }),
      }),
    };
  }
  throw new Error(`tabla admin no mockeada: ${table}`);
}

const adminStorage = {
  from: (_bucket: string) => ({
    createSignedUrl: (path: string, expiry: number) => {
      mockState.createSignedUrlCalledWith = [path, expiry];
      return Promise.resolve(mockState.signedUrlResult);
    },
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: adminFrom,
    storage: adminStorage,
  }),
}));

// ── Cliente de usuario (createClient, usado por getAuthUser) ──

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: mockState.user } }) },
  }),
}));

// ── Bordes de dominio ya cubiertos por sus propios tests ────────
// (lib/classroom/__tests__/access.test.ts resuelve las ramas de
// getClassroomAccess; acá sólo importa qué devuelve para el gate del route).

vi.mock("@/lib/classroom/access", () => ({
  getClassroomAccess: (..._args: unknown[]) => Promise.resolve(mockState.classroomAccess),
}));

vi.mock("@/lib/classroom/resolve-viewer-cohort", () => ({
  resolveViewerCohortForProgram: (..._args: unknown[]) =>
    Promise.resolve(mockState.viewerCohort),
}));

// ── Import del handler (DESPUÉS de los mocks) ──────────────────

const { GET } = await import("@/app/api/classroom/resources/[id]/url/route");

// ── Reset de estado antes de cada test ──────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockState.user = FAKE_USER;
  mockState.lessonResourceRow = {
    id: RESOURCE_ID,
    lesson_id: LESSON_ID,
    url: "https://externo.test/archivo.pdf",
    storage_path: "lesson/archivo.pdf",
    type: "pdf",
  };
  mockState.lessonRow = {
    id: LESSON_ID,
    program_modules: { program_id: PROGRAM_ID },
  };
  mockState.viewerCohort = { id: COHORT_ID, slug: "g1" };
  mockState.sessionResourceRow = {
    id: RESOURCE_ID,
    session_id: SESSION_ID,
    url: "https://externo.test/sesion.pdf",
    storage_path: "session/archivo.pdf",
    type: "pdf",
  };
  mockState.classSessionRow = { cohort_id: COHORT_ID };
  mockState.classroomAccess = { enrollment: null, isStaff: true };
  mockState.signedUrlResult = {
    data: { signedUrl: "https://signed.test/archivo.pdf?token=abc" },
    error: null,
  };
  mockState.createSignedUrlCalledWith = null;
});

// ── Validación de entrada ─────────────────────────────────────

describe("GET /api/classroom/resources/[id]/url — validación", () => {
  it("retorna 401 si no hay usuario autenticado", async () => {
    mockState.user = null;

    const res = await GET(makeRequest(RESOURCE_ID, "lesson"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("retorna 422 si el id no tiene formato UUID", async () => {
    const res = await GET(makeRequest("no-es-un-uuid", "lesson"), ctxFor("no-es-un-uuid"));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("ID inválido");
  });

  it("retorna 422 si falta el parámetro table", async () => {
    const res = await GET(makeRequest(RESOURCE_ID, null), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("table inválido");
  });

  it("retorna 422 si table trae un valor que no es lesson ni session", async () => {
    const res = await GET(makeRequest(RESOURCE_ID, "otro"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("table inválido");
  });
});

// ── table=lesson ─────────────────────────────────────────────

describe("GET .../url?table=lesson", () => {
  it("retorna 404 si el recurso de lección no existe", async () => {
    mockState.lessonResourceRow = null;

    const res = await GET(makeRequest(RESOURCE_ID, "lesson"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Recurso no encontrado");
  });

  it("retorna 404 si la lección dueña del recurso no existe", async () => {
    mockState.lessonRow = null;

    const res = await GET(makeRequest(RESOURCE_ID, "lesson"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Recurso no encontrado");
  });

  it("retorna 404 si la lección no tiene program_modules.program_id resoluble", async () => {
    mockState.lessonRow = { id: LESSON_ID, program_modules: null };

    const res = await GET(makeRequest(RESOURCE_ID, "lesson"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Recurso no encontrado");
  });

  it("retorna 404 si el usuario no tiene cohorte en ninguna cohorte del programa (sin acceso)", async () => {
    mockState.viewerCohort = null;

    const res = await GET(makeRequest(RESOURCE_ID, "lesson"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Recurso no encontrado");
  });

  it("con acceso y storage_path, retorna la signed URL de vista y de descarga", async () => {
    const res = await GET(makeRequest(RESOURCE_ID, "lesson"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.viewUrl).toBe("https://signed.test/archivo.pdf?token=abc");
    expect(json.downloadUrl).toBe("https://signed.test/archivo.pdf?token=abc&download=");
    expect(mockState.createSignedUrlCalledWith).toEqual(["lesson/archivo.pdf", 3_600]);
  });

  it("con recurso externo (sin storage_path), retorna la url tal cual sin firmar nada", async () => {
    mockState.lessonResourceRow = {
      ...(mockState.lessonResourceRow as Record<string, unknown>),
      storage_path: null,
    };

    const res = await GET(makeRequest(RESOURCE_ID, "lesson"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.viewUrl).toBeNull();
    expect(json.downloadUrl).toBe("https://externo.test/archivo.pdf");
    expect(mockState.createSignedUrlCalledWith).toBeNull();
  });

  it("retorna 500 si la firma de la signed URL falla", async () => {
    mockState.signedUrlResult = { data: null, error: { message: "boom signing" } };

    const res = await GET(makeRequest(RESOURCE_ID, "lesson"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No se pudo firmar el recurso");
  });

  it("retorna 500 si Storage no devuelve error pero tampoco signedUrl", async () => {
    mockState.signedUrlResult = { data: null, error: null };

    const res = await GET(makeRequest(RESOURCE_ID, "lesson"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(500);
  });
});

// ── table=session ────────────────────────────────────────────

describe("GET .../url?table=session", () => {
  it("retorna 404 si el recurso de sesión no existe", async () => {
    mockState.sessionResourceRow = null;

    const res = await GET(makeRequest(RESOURCE_ID, "session"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Recurso no encontrado");
  });

  it("retorna 404 si la sesión dueña del recurso no tiene cohort_id", async () => {
    mockState.classSessionRow = { cohort_id: null };

    const res = await GET(makeRequest(RESOURCE_ID, "session"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Recurso no encontrado");
  });

  it("retorna 404 si el usuario no tiene acceso a la cohorte de la sesión", async () => {
    mockState.classroomAccess = null;

    const res = await GET(makeRequest(RESOURCE_ID, "session"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Recurso no encontrado");
  });

  it("con acceso y storage_path, retorna la signed URL de vista y de descarga", async () => {
    const res = await GET(makeRequest(RESOURCE_ID, "session"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.viewUrl).toBe("https://signed.test/archivo.pdf?token=abc");
    expect(json.downloadUrl).toBe("https://signed.test/archivo.pdf?token=abc&download=");
    expect(mockState.createSignedUrlCalledWith).toEqual(["session/archivo.pdf", 3_600]);
  });

  it("con recurso externo (sin storage_path), retorna la url tal cual sin firmar nada", async () => {
    mockState.sessionResourceRow = {
      ...(mockState.sessionResourceRow as Record<string, unknown>),
      storage_path: null,
    };

    const res = await GET(makeRequest(RESOURCE_ID, "session"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.viewUrl).toBeNull();
    expect(json.downloadUrl).toBe("https://externo.test/sesion.pdf");
  });

  it("retorna 500 si la firma de la signed URL falla", async () => {
    mockState.signedUrlResult = { data: null, error: { message: "boom signing" } };

    const res = await GET(makeRequest(RESOURCE_ID, "session"), ctxFor(RESOURCE_ID));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No se pudo firmar el recurso");
  });
});
