import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks de los bordes: authorizeAdmin (auth) y correctTranscript ---
// (correctTranscript ya tiene su propia suite, así que acá solo se mockea
// para ejercitar el mapeo de errores del route handler).

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

const correctTranscriptMock = vi.fn();
vi.mock("@/lib/classroom/correct-transcript", () => ({
  correctTranscript: (...args: unknown[]) => correctTranscriptMock(...args),
}));

const { POST } = await import("@/app/api/admin/correct-transcript/route");

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/admin/correct-transcript", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function invalidJsonReq(): Request {
  return new Request("http://localhost/api/admin/correct-transcript", {
    method: "POST",
    body: "{ esto no es json",
  });
}

describe("POST /api/admin/correct-transcript", () => {
  beforeEach(() => {
    authResult = { user: { id: "admin-1" } };
    process.env.OPENAI_API_KEY = "test-key";
    correctTranscriptMock.mockReset();
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
    expect(correctTranscriptMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 si el body no es JSON válido", async () => {
    const res = await POST(invalidJsonReq());
    const body = await res!.json();

    expect(res!.status).toBe(400);
    expect(body).toEqual({ error: "Body invalido" });
    expect(correctTranscriptMock).not.toHaveBeenCalled();
  });

  it("devuelve 422 si falta lessonId", async () => {
    const res = await POST(jsonReq({}));
    const body = await res!.json();

    expect(res!.status).toBe(422);
    expect(body).toEqual({ error: "lessonId es requerido" });
    expect(correctTranscriptMock).not.toHaveBeenCalled();
  });

  it("devuelve 500 si OPENAI_API_KEY no está configurada", async () => {
    delete process.env.OPENAI_API_KEY;

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(500);
    expect(body).toEqual({
      error: "OPENAI_API_KEY no esta configurada en el servidor",
    });
    expect(correctTranscriptMock).not.toHaveBeenCalled();
  });

  it("camino feliz: devuelve 200 con el resultado de la corrección", async () => {
    const result = {
      lessonId: "lesson-1",
      segmentsCorrected: 12,
      vttUpdated: true,
    };
    correctTranscriptMock.mockResolvedValue(result);

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(200);
    expect(body).toEqual(result);
    expect(correctTranscriptMock).toHaveBeenCalledWith("lesson-1");
  });

  it("devuelve 404 cuando no se encuentra la transcripción ('No transcript found')", async () => {
    correctTranscriptMock.mockRejectedValue(
      new Error("No transcript found for lesson lesson-x"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-x" }));
    const body = await res!.json();

    expect(res!.status).toBe(404);
    expect(body).toEqual({
      error: "No transcript found for lesson lesson-x",
    });
  });

  it("devuelve 404 cuando la transcripción no tiene contenido VTT ('has no VTT content')", async () => {
    correctTranscriptMock.mockRejectedValue(
      new Error("Lesson lesson-1 has no VTT content"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(404);
    expect(body).toEqual({
      error: "Lesson lesson-1 has no VTT content",
    });
  });

  it("devuelve 404 cuando el parseo del VTT arroja 0 segmentos ('Parsed 0 segments')", async () => {
    correctTranscriptMock.mockRejectedValue(
      new Error("Parsed 0 segments from VTT"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(404);
    expect(body).toEqual({
      error: "Parsed 0 segments from VTT",
    });
  });

  it("devuelve 502 cuando falla la comunicación con OpenAI", async () => {
    correctTranscriptMock.mockRejectedValue(
      new Error("OpenAI returned empty content"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(502);
    expect(body).toEqual({ error: "Error al comunicarse con OpenAI" });
  });

  it("devuelve 500 genérico para un Error inesperado no reconocido", async () => {
    correctTranscriptMock.mockRejectedValue(
      new Error("boom: fallo de base de datos"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(500);
    expect(body).toEqual({ error: "Error al corregir la transcripcion" });
  });

  it("devuelve 500 genérico cuando se lanza un valor que no es Error", async () => {
    // BUG: el handler solo distingue `err instanceof Error`; si el rechazo es
    // un valor no-Error (string, objeto plano, etc.) cae siempre en el
    // mensaje genérico "Error desconocido" y por lo tanto en el catch-all
    // 500, sin posibilidad de mapear a 404/502 aunque el motivo real sea, por
    // ejemplo, una transcripción inexistente. Se documenta el comportamiento
    // actual, no se corrige el fuente.
    correctTranscriptMock.mockRejectedValue("fallo raro sin Error");

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(500);
    expect(body).toEqual({ error: "Error al corregir la transcripcion" });
  });
});
