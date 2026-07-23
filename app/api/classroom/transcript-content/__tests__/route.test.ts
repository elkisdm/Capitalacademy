import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const LESSON_ID = "c1c2c3c4-e5f6-7890-abcd-ef1234567892";
const USER_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567891";
const PROGRAM_ID = "d1d2d3d4-e5f6-7890-abcd-ef1234567893";
const COHORT_ID = "f1f2f3f4-e5f6-7890-abcd-ef1234567895";
const FAKE_USER = { id: USER_ID };

function makeRequest(lessonId?: string | null) {
  const url = new URL("http://localhost/api/classroom/transcript-content");
  if (lessonId !== undefined && lessonId !== null) url.searchParams.set("lessonId", lessonId);
  return new Request(url.toString());
}

// ── Estado mutable leído por los mocks ──────────────────────────

const mockState = {
  user: FAKE_USER as { id: string } | null,

  // admin.from("lessons").select().eq().maybeSingle()
  lessonRow: {
    id: LESSON_ID,
    program_modules: { program_id: PROGRAM_ID },
  } as Record<string, unknown> | null,

  // resolveViewerCohortForProgram(userId, programId)
  viewerCohort: { id: COHORT_ID, slug: "g1" } as { id: string; slug: string } | null,

  // admin.from("lesson_transcripts").select().eq().eq().maybeSingle()
  transcriptRow: {
    content_vtt: "WEBVTT\n\n00:00.000 --> 00:01.000\nHola",
    corrected_vtt: "WEBVTT\n\n00:00.000 --> 00:01.000\nHola (corregido)",
  } as Record<string, unknown> | null,
};

// ── Cliente admin (createAdminClient) ─────────────────────────

function adminFrom(table: string) {
  if (table === "lessons") {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: mockState.lessonRow, error: null }),
        }),
      }),
    };
  }
  if (table === "lesson_transcripts") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: mockState.transcriptRow, error: null }),
          }),
        }),
      }),
    };
  }
  throw new Error(`tabla admin no mockeada: ${table}`);
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: adminFrom,
  }),
}));

// ── Cliente de usuario (createClient, usado por getAuthUser) ──

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: mockState.user } }) },
  }),
}));

vi.mock("@/lib/classroom/resolve-viewer-cohort", () => ({
  resolveViewerCohortForProgram: (..._args: unknown[]) =>
    Promise.resolve(mockState.viewerCohort),
}));

// ── Import del handler (DESPUÉS de los mocks) ──────────────────

const { GET } = await import("@/app/api/classroom/transcript-content/route");

// ── Reset de estado antes de cada test ──────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockState.user = FAKE_USER;
  mockState.lessonRow = {
    id: LESSON_ID,
    program_modules: { program_id: PROGRAM_ID },
  };
  mockState.viewerCohort = { id: COHORT_ID, slug: "g1" };
  mockState.transcriptRow = {
    content_vtt: "WEBVTT\n\n00:00.000 --> 00:01.000\nHola",
    corrected_vtt: "WEBVTT\n\n00:00.000 --> 00:01.000\nHola (corregido)",
  };
});

// ── Validación de entrada ─────────────────────────────────────

describe("GET /api/classroom/transcript-content — validación", () => {
  it("retorna 401 si no hay usuario autenticado", async () => {
    mockState.user = null;

    const res = await GET(makeRequest(LESSON_ID));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
  });

  it("retorna 422 si falta el parámetro lessonId", async () => {
    const res = await GET(makeRequest(null));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("lessonId inválido");
  });

  it("retorna 422 si lessonId no tiene formato UUID", async () => {
    const res = await GET(makeRequest("no-es-un-uuid"));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("lessonId inválido");
  });
});

// ── Gate de acceso (lección → programa → cohorte) ────────────

describe("GET /api/classroom/transcript-content — gate de acceso", () => {
  it("retorna 404 si la lección no existe", async () => {
    mockState.lessonRow = null;

    const res = await GET(makeRequest(LESSON_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Transcripción no encontrada");
  });

  it("retorna 404 si la lección no tiene program_modules.program_id resoluble", async () => {
    mockState.lessonRow = { id: LESSON_ID, program_modules: null };

    const res = await GET(makeRequest(LESSON_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Transcripción no encontrada");
  });

  it("retorna 404 si el usuario no tiene cohorte en ninguna cohorte del programa (sin acceso)", async () => {
    mockState.viewerCohort = null;

    const res = await GET(makeRequest(LESSON_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Transcripción no encontrada");
  });
});

// ── Resolución de la transcripción ───────────────────────────

describe("GET /api/classroom/transcript-content — transcripción", () => {
  it("retorna 404 si no existe una fila de transcripción (o no está en status ready)", async () => {
    mockState.transcriptRow = null;

    const res = await GET(makeRequest(LESSON_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Transcripción no encontrada");
  });

  it("retorna 404 si la fila existe pero content_vtt es null", async () => {
    mockState.transcriptRow = { content_vtt: null, corrected_vtt: null };

    const res = await GET(makeRequest(LESSON_ID));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Transcripción no encontrada");
  });

  it("con acceso y transcripción lista, retorna el VTT crudo y el corregido", async () => {
    const res = await GET(makeRequest(LESSON_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.contentVtt).toBe(mockState.transcriptRow!.content_vtt);
    expect(json.correctedVtt).toBe(mockState.transcriptRow!.corrected_vtt);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
  });

  it("si no hay corrected_vtt, lo normaliza a null en la respuesta", async () => {
    mockState.transcriptRow = {
      content_vtt: "WEBVTT\n\n00:00.000 --> 00:01.000\nHola",
      corrected_vtt: undefined,
    };

    const res = await GET(makeRequest(LESSON_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.correctedVtt).toBeNull();
  });
});
