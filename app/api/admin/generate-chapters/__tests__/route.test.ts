import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks de los bordes: authorizeAdmin (auth) y generateLessonChapters ---
// (esta última ya tiene su propia suite en
// lib/classroom/__tests__/generate-chapters.test.ts, así que acá solo se
// mockea para ejercitar el mapeo de errores del route handler).

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

const generateLessonChaptersMock = vi.fn();
vi.mock("@/lib/classroom/generate-chapters", () => ({
  generateLessonChapters: (...args: unknown[]) =>
    generateLessonChaptersMock(...args),
}));

const { POST } = await import("@/app/api/admin/generate-chapters/route");

const ORIGINAL_OPENAI_KEY = process.env.OPENAI_API_KEY;

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/admin/generate-chapters", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function invalidJsonReq(): Request {
  return new Request("http://localhost/api/admin/generate-chapters", {
    method: "POST",
    body: "{ esto no es json",
  });
}

describe("POST /api/admin/generate-chapters", () => {
  beforeEach(() => {
    authResult = { user: { id: "admin-1" } };
    process.env.OPENAI_API_KEY = "test-key";
    generateLessonChaptersMock.mockReset();
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
    expect(generateLessonChaptersMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 si el body no es JSON válido", async () => {
    const res = await POST(invalidJsonReq());
    const body = await res!.json();

    expect(res!.status).toBe(400);
    expect(body).toEqual({ error: "Body invalido" });
    expect(generateLessonChaptersMock).not.toHaveBeenCalled();
  });

  it("devuelve 422 si falta lessonId", async () => {
    const res = await POST(jsonReq({}));
    const body = await res!.json();

    expect(res!.status).toBe(422);
    expect(body).toEqual({ error: "lessonId es requerido" });
    expect(generateLessonChaptersMock).not.toHaveBeenCalled();
  });

  it("devuelve 500 si OPENAI_API_KEY no está configurada", async () => {
    delete process.env.OPENAI_API_KEY;

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(500);
    expect(body).toEqual({
      error: "OPENAI_API_KEY no esta configurada en el servidor",
    });
    expect(generateLessonChaptersMock).not.toHaveBeenCalled();
  });

  it("camino feliz: devuelve 200 con los capítulos generados", async () => {
    const chapters = [
      {
        id: "chap-1",
        lesson_id: "lesson-1",
        title: "Introducción",
        position_seconds: 0,
        sort_order: 0,
        is_generated: true,
      },
    ];
    generateLessonChaptersMock.mockResolvedValue(chapters);

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(200);
    expect(body).toEqual({ chapters });
    expect(generateLessonChaptersMock).toHaveBeenCalledWith("lesson-1");
  });

  it("devuelve 404 cuando la lección no existe", async () => {
    generateLessonChaptersMock.mockRejectedValue(
      new Error("Lesson not found: lesson-x"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-x" }));
    const body = await res!.json();

    expect(res!.status).toBe(404);
    expect(body).toEqual({ error: "Leccion no encontrada" });
  });

  it("devuelve 422 cuando la lección no tiene duración de video", async () => {
    generateLessonChaptersMock.mockRejectedValue(
      new Error("Lesson lesson-1 has no video duration"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(422);
    expect(body).toEqual({
      error: "La leccion no tiene duracion de video registrada",
    });
  });

  it("devuelve 404 cuando no hay transcripción disponible", async () => {
    generateLessonChaptersMock.mockRejectedValue(
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
    generateLessonChaptersMock.mockRejectedValue(
      new Error("transcript_corrupted"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(422);
    expect(body).toEqual({
      error: "La transcripcion parece corrupta o incoherente",
    });
  });

  it("devuelve 502 cuando OpenAI no genera capítulos válidos", async () => {
    generateLessonChaptersMock.mockRejectedValue(
      new Error("OpenAI no genero capitulos validos"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(502);
    expect(body).toEqual({ error: "OpenAI no genero capitulos validos" });
  });

  it("devuelve 502 cuando falla la comunicación con OpenAI (mensaje que empieza con 'OpenAI')", async () => {
    generateLessonChaptersMock.mockRejectedValue(
      new Error("OpenAI returned empty content"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(502);
    expect(body).toEqual({ error: "Error al comunicarse con OpenAI" });
  });

  it("devuelve 502 cuando falla la comunicación con OpenAI (mensaje que incluye 'OpenAI API error')", async () => {
    generateLessonChaptersMock.mockRejectedValue(
      new Error("Request failed: OpenAI API error 500: server error"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(502);
    expect(body).toEqual({ error: "Error al comunicarse con OpenAI" });
  });

  it("devuelve 500 genérico para un Error inesperado no reconocido", async () => {
    generateLessonChaptersMock.mockRejectedValue(
      new Error("boom: fallo de base de datos"),
    );

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(500);
    expect(body).toEqual({ error: "Error al guardar los capitulos" });
  });

  it("devuelve 500 genérico cuando se lanza un valor que no es Error", async () => {
    // BUG: el handler solo distingue `err instanceof Error`; si el rechazo es un
    // valor no-Error (string, objeto plano, etc.) cae siempre en el mensaje
    // genérico "Error desconocido" y por lo tanto en el catch-all 500, sin
    // posibilidad de mapear a 404/422/502 aunque el motivo real sea, por
    // ejemplo, una lección no encontrada. No es un bug de datos ni de permisos
    // (generateLessonChapters siempre rechaza con Error en la práctica), pero
    // deja documentado el comportamiento actual.
    generateLessonChaptersMock.mockRejectedValue("fallo raro sin Error");

    const res = await POST(jsonReq({ lessonId: "lesson-1" }));
    const body = await res!.json();

    expect(res!.status).toBe(500);
    expect(body).toEqual({ error: "Error al guardar los capitulos" });
  });
});
