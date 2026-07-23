import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

const { generateLessonChapters } = await import("@/lib/classroom/generate-chapters");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AdminMockConfig {
  lesson?: { data: unknown; error?: unknown };
  transcript?: { data: unknown; error?: unknown };
  deleteError?: { message: string } | null;
  insertResult?: { data: unknown; error: unknown };
}

/** Simula `admin.from(...)` para las tres tablas que usa generateLessonChapters. */
function createAdminMock(config: AdminMockConfig) {
  const deleteCalls: Array<{ lessonId?: string }> = [];
  const insertCalls: unknown[][] = [];

  const fromMock = vi.fn((table: string) => {
    if (table === "lessons") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(config.lesson ?? { data: null, error: null }),
          }),
        }),
      };
    }
    if (table === "lesson_transcripts") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve(config.transcript ?? { data: null, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === "lesson_chapters") {
      return {
        delete: () => ({
          eq: () => ({
            eq: () => {
              deleteCalls.push({});
              return Promise.resolve({ error: config.deleteError ?? null });
            },
          }),
        }),
        insert: (rows: unknown[]) => {
          insertCalls.push(rows);
          return {
            select: () =>
              Promise.resolve(config.insertResult ?? { data: [], error: null }),
          };
        },
      };
    }
    throw new Error(`tabla no mockeada: ${table}`);
  });

  return { fromMock, deleteCalls, insertCalls };
}

/** Fetch mock que responde con un `content` fijo (string ya serializado) para cada llamada. */
function mockOpenAIFetchOnce(content: string) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({ choices: [{ message: { content } }] }),
  }));
}

/** Fetch mock que devuelve una secuencia de `content` distinta en cada llamada. */
function mockOpenAIFetchSequence(contents: string[]) {
  let call = 0;
  return vi.fn(async () => {
    const content = contents[Math.min(call, contents.length - 1)];
    call++;
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ choices: [{ message: { content } }] }),
    };
  });
}

const LESSON_ROW = {
  id: "lesson-1",
  title: "Introducción a la renta fija",
  video_duration_seconds: 600,
};

const TRANSCRIPT_ROW = {
  content_text: "Hoy hablaremos de bonos y tasas de interés...",
};

const VALID_CHAPTERS_CONTENT = JSON.stringify({
  chapters: [
    { title: "Introducción", position_seconds: 0 },
    { title: "Bonos", position_seconds: 120 },
    { title: "Tasas de interés", position_seconds: 300 },
  ],
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const ORIGINAL_API_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test-key";
});

afterEach(() => {
  process.env.OPENAI_API_KEY = ORIGINAL_API_KEY;
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Validaciones tempranas (lección / transcripción)
// ---------------------------------------------------------------------------

describe("generateLessonChapters — validaciones de entrada", () => {
  it("lanza si la lección no existe", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: null, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /Lesson not found: lesson-1/,
    );
  });

  it("lanza si la lección no tiene video_duration_seconds", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: { ...LESSON_ROW, video_duration_seconds: null }, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /Lesson lesson-1 has no video duration/,
    );
  });

  it("no confunde video_duration_seconds: 0 con 'sin duración' (0 es un valor válido)", async () => {
    // Con duración 0 el chequeo de existencia de duración pasa (0 es un valor real,
    // distinto de null/undefined), así que el flujo continúa y falla más adelante
    // por falta de transcripción, no por "no video duration".
    const { fromMock } = createAdminMock({
      lesson: { data: { ...LESSON_ROW, video_duration_seconds: 0 }, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /No transcript found for lesson lesson-1/,
    );
  });

  it("lanza si no hay transcripción con status 'ready'", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: null, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /No transcript found for lesson lesson-1/,
    );
  });

  it("lanza si la transcripción existe pero content_text está vacío", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: { content_text: "" }, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /No transcript found for lesson lesson-1/,
    );
  });
});

// ---------------------------------------------------------------------------
// Llamada a OpenAI (callOpenAI) y su lógica de reintento
// ---------------------------------------------------------------------------

describe("generateLessonChapters — llamada a OpenAI", () => {
  it("lanza si no hay OPENAI_API_KEY configurada (sin llamar a fetch)", async () => {
    delete process.env.OPENAI_API_KEY;
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /OPENAI_API_KEY is not configured/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lanza de inmediato (sin reintento) si la respuesta HTTP no es ok", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /OpenAI API error 429: rate limited/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("usa 'unknown error' si la respuesta no-ok tampoco puede leer el texto", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => {
          throw new Error("stream ya consumido");
        },
      }),
    );

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /OpenAI API error 500: unknown error/,
    );
  });

  it("reintenta una vez si OpenAI devuelve contenido vacío, y lanza tras el segundo intento fallido", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ choices: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /OpenAI returned empty content/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reintenta una vez si el contenido no es JSON válido, y lanza tras el segundo intento fallido", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    const fetchMock = mockOpenAIFetchOnce("esto no es json");
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(SyntaxError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("si el primer intento falla el parseo y el segundo es válido, continúa con éxito", async () => {
    const { fromMock, insertCalls } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
      insertResult: {
        data: [
          { id: "1", lesson_id: "lesson-1", title: "Introducción", position_seconds: 0, sort_order: 0, is_generated: true },
        ],
        error: null,
      },
    });
    mockFrom.mockImplementation(fromMock);
    const fetchMock = mockOpenAIFetchSequence(["json invalido", VALID_CHAPTERS_CONTENT]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateLessonChapters("lesson-1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(insertCalls[0]).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Respuesta de "transcripción corrupta" y forma inesperada de la respuesta
// ---------------------------------------------------------------------------

describe("generateLessonChapters — respuesta de error del modelo", () => {
  it("lanza 'transcript_corrupted' cuando el modelo reporta la transcripción como corrupta", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal(
      "fetch",
      mockOpenAIFetchOnce(JSON.stringify({ error: "transcript_corrupted" })),
    );

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /transcript_corrupted/,
    );
  });

  it("lanza un error de dominio legible cuando el modelo reporta un 'error' distinto de transcript_corrupted", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal(
      "fetch",
      mockOpenAIFetchOnce(JSON.stringify({ error: "modelo_confundido" })),
    );

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /OpenAI reporto un error al generar capitulos: modelo_confundido/,
    );
  });

  it("lanza un error de dominio legible cuando la respuesta es JSON válido pero sin la clave 'chapters'", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal("fetch", mockOpenAIFetchOnce(JSON.stringify({ foo: "bar" })));

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /OpenAI no devolvio la clave 'chapters' esperada/,
    );
  });
});

// ---------------------------------------------------------------------------
// Validación y filtrado de capítulos
// ---------------------------------------------------------------------------

describe("generateLessonChapters — filtrado de capítulos válidos", () => {
  it("descarta capítulos con position_seconds no entero, negativo o >= duración, y títulos vacíos", async () => {
    const { fromMock, insertCalls } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
      insertResult: { data: [], error: null },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal(
      "fetch",
      mockOpenAIFetchOnce(
        JSON.stringify({
          chapters: [
            { title: "Válido inicio", position_seconds: 0 },
            { title: "No entero", position_seconds: 10.5 },
            { title: "Negativo", position_seconds: -5 },
            { title: "En el límite de la duración", position_seconds: 600 }, // duración == 600, excluido por `< duration`
            { title: "   ", position_seconds: 50 }, // título vacío tras trim
            { title: "Válido medio", position_seconds: 200 },
          ],
        }),
      ),
    );

    await generateLessonChapters("lesson-1");

    expect(insertCalls).toHaveLength(1);
    const rows = insertCalls[0] as Array<{ title: string; position_seconds: number; sort_order: number }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: "Válido inicio", position_seconds: 0, sort_order: 0 });
    expect(rows[1]).toMatchObject({ title: "Válido medio", position_seconds: 200, sort_order: 1 });
  });

  it("recorta espacios del título antes de guardarlo", async () => {
    const { fromMock, insertCalls } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
      insertResult: { data: [], error: null },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal(
      "fetch",
      mockOpenAIFetchOnce(
        JSON.stringify({ chapters: [{ title: "  Con espacios  ", position_seconds: 0 }] }),
      ),
    );

    await generateLessonChapters("lesson-1");

    const rows = insertCalls[0] as Array<{ title: string }>;
    expect(rows[0].title).toBe("Con espacios");
  });

  it("lanza si ningún capítulo devuelto es válido", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal(
      "fetch",
      mockOpenAIFetchOnce(
        JSON.stringify({ chapters: [{ title: "", position_seconds: -1 }] }),
      ),
    );

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /OpenAI no genero capitulos validos/,
    );
  });

  it("lanza si el arreglo de capítulos viene vacío", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal("fetch", mockOpenAIFetchOnce(JSON.stringify({ chapters: [] })));

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /OpenAI no genero capitulos validos/,
    );
  });
});

// ---------------------------------------------------------------------------
// Persistencia en lesson_chapters
// ---------------------------------------------------------------------------

describe("generateLessonChapters — persistencia", () => {
  it("lanza si falla el delete de capítulos generados previamente", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
      deleteError: { message: "constraint violada" },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal("fetch", mockOpenAIFetchOnce(VALID_CHAPTERS_CONTENT));

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /Failed to delete old lesson_chapters: constraint violada/,
    );
  });

  it("lanza si falla el insert de los nuevos capítulos", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
      insertResult: { data: null, error: { message: "columna no existe" } },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal("fetch", mockOpenAIFetchOnce(VALID_CHAPTERS_CONTENT));

    await expect(generateLessonChapters("lesson-1")).rejects.toThrow(
      /Failed to insert lesson_chapters: columna no existe/,
    );
  });

  it("camino feliz: borra los capítulos generados previos, inserta los nuevos con sort_order secuencial y devuelve las filas insertadas", async () => {
    const insertedRows = [
      { id: "c1", lesson_id: "lesson-1", title: "Introducción", position_seconds: 0, sort_order: 0, is_generated: true },
      { id: "c2", lesson_id: "lesson-1", title: "Bonos", position_seconds: 120, sort_order: 1, is_generated: true },
      { id: "c3", lesson_id: "lesson-1", title: "Tasas de interés", position_seconds: 300, sort_order: 2, is_generated: true },
    ];
    const { fromMock, deleteCalls, insertCalls } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
      insertResult: { data: insertedRows, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal("fetch", mockOpenAIFetchOnce(VALID_CHAPTERS_CONTENT));

    const result = await generateLessonChapters("lesson-1");

    expect(deleteCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
    const rows = insertCalls[0] as Array<{ lesson_id: string; is_generated: boolean; sort_order: number }>;
    expect(rows.every((r) => r.lesson_id === "lesson-1" && r.is_generated === true)).toBe(true);
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1, 2]);
    expect(result).toEqual(insertedRows);
  });
});
