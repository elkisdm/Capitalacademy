import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks de los bordes: authorizeAdmin (auth) y generateLessonSummary ---
// (esta última ya tiene/tendría su propia suite en
// lib/classroom/__tests__/generate-summary.test.ts, así que acá solo se
// mockea para ejercitar el mapeo de errores del route handler).

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

const generateLessonSummaryMock = vi.fn();
vi.mock("@/lib/classroom/generate-summary", () => ({
  generateLessonSummary: (...args: unknown[]) =>
    generateLessonSummaryMock(...args),
}));

const { POST } = await import("@/app/api/admin/generate-summary/route");

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/admin/generate-summary", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function invalidJsonReq(): Request {
  return new Request("http://localhost/api/admin/generate-summary", {
    method: "POST",
    body: "{ esto no es json",
  });
}

describe("POST /api/admin/generate-summary", () => {
  beforeEach(() => {
    authResult = { user: { id: "admin-1" } };
    process.env.OPENAI_API_KEY = "test-key";
    generateLessonSummaryMock.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_OPENAI_KEY === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_KEY;
    }
  });

  it("devuelve el error de autorización cuando authorizeAdmin rechaza", async () => {
    authResult = {
      error: Response.json({ error: "No autorizado" }, { status: 403 }),
    };

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));

    expect(res!.status).toBe(403);
    expect(generateLessonSummaryMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 si el body no es JSON válido", async () => {
    const res = await POST(invalidJsonReq());
    const body = await res!.json();

    expect(res!.status).toBe(400);
    expect(body).toEqual({ error: "Body invalido" });
    expect(generateLessonSummaryMock).not.toHaveBeenCalled();
  });

  it("devuelve 422 si falta lessonId", async () => {
    const res = await POST(jsonReq({}));
    const body = await res!.json();

    expect(res!.status).toBe(422);
    expect(body).toEqual({ error: "lessonId es requerido" });
    expect(generateLessonSummaryMock).not.toHaveBeenCalled();
  });

  it("devuelve 500 si OPENAI_API_KEY no está configurada", async () => {
    delete process.env.OPENAI_API_KEY;

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(500);
    expect(body).toEqual({
      error: "OPENAI_API_KEY no esta configurada en el servidor",
    });
    expect(generateLessonSummaryMock).not.toHaveBeenCalled();
  });

  it("camino feliz: devuelve 200 con el resumen generado", async () => {
    const summary = {
      lesson_id: "lesson-1",
      key_points: ["punto 1", "punto 2"],
      summary_text: "Resumen de la clase.",
      glossary: [{ term: "MLS", definition: "Multiple Listing Service" }],
      model_used: "gpt-5.4-mini",
      prompt_version: 1,
      generation_count: 1,
      is_manually_edited: false,
      generated_at: "2026-07-23T00:00:00.000Z",
    };
    generateLessonSummaryMock.mockResolvedValue(summary);

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(200);
    expect(body).toEqual(summary);
    expect(generateLessonSummaryMock).toHaveBeenCalledWith("lesson-1");
  });

  it("devuelve 404 cuando la lección no existe", async () => {
    generateLessonSummaryMock.mockRejectedValue(
      new Error("Lesson not found: lesson-x"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-x" }));
    const body = await res!.json();

    expect(res!.status).toBe(404);
    expect(body).toEqual({ error: "Leccion no encontrada" });
  });

  it("devuelve 404 cuando no hay transcripción disponible", async () => {
    generateLessonSummaryMock.mockRejectedValue(
      new Error("No transcript found for lesson lesson-1"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(404);
    expect(body).toEqual({
      error: "No hay transcripcion disponible para esta leccion",
    });
  });

  it("devuelve 422 cuando la transcripción está corrupta", async () => {
    generateLessonSummaryMock.mockRejectedValue(
      new Error("transcript_corrupted: transcript_corrupted"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(422);
    expect(body).toEqual({
      error: "La transcripcion parece corrupta o incoherente",
    });
  });

  it("devuelve 502 cuando falla la comunicación con OpenAI (mensaje que empieza con 'OpenAI')", async () => {
    generateLessonSummaryMock.mockRejectedValue(
      new Error("OpenAI returned empty content"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(502);
    expect(body).toEqual({ error: "Error al comunicarse con OpenAI" });
  });

  it("devuelve 502 cuando falla la comunicación con OpenAI (mensaje que incluye 'OpenAI API error')", async () => {
    generateLessonSummaryMock.mockRejectedValue(
      new Error("Request failed: OpenAI API error 500: server error"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(502);
    expect(body).toEqual({ error: "Error al comunicarse con OpenAI" });
  });

  it("devuelve 500 genérico para un Error inesperado no reconocido", async () => {
    generateLessonSummaryMock.mockRejectedValue(
      new Error("boom: fallo de base de datos"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(500);
    expect(body).toEqual({ error: "Error al guardar el resumen" });
  });

  it("devuelve 500 genérico cuando se lanza un valor que no es Error", async () => {
    // BUG: el handler solo distingue `err instanceof Error`; si el rechazo es un
    // valor no-Error (string, objeto plano, etc.) cae siempre en el mensaje
    // genérico "Error desconocido" y por lo tanto en el catch-all 500, sin
    // posibilidad de mapear a 404/422/502 aunque el motivo real sea, por
    // ejemplo, una lección no encontrada. No es un bug de datos ni de permisos
    // (generateLessonSummary siempre rechaza con Error en la práctica), pero
    // deja documentado el comportamiento actual.
    generateLessonSummaryMock.mockRejectedValue("fallo raro sin Error");

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(500);
    expect(body).toEqual({ error: "Error al guardar el resumen" });
  });
});
