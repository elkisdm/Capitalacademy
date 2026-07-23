import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

const { generateLessonSummary } = await import("@/lib/classroom/generate-summary");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AdminMockConfig {
  lesson: { data: unknown; error?: unknown };
  transcript?: { data: unknown; error?: unknown };
  existingSummary?: { data: unknown; error?: unknown };
  upsertResult?: { data: unknown; error?: unknown };
}

/** Simula `admin.from(...)` para las tres tablas que usa generateLessonSummary. */
function createAdminMock(config: AdminMockConfig) {
  let upsertPayload: Record<string, unknown> | null = null;
  let upsertOptions: unknown = null;
  let upsertCalled = false;

  const fromMock = vi.fn((table: string) => {
    if (table === "lessons") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve(config.lesson),
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
    if (table === "lesson_summaries") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(config.existingSummary ?? { data: null, error: null }),
          }),
        }),
        upsert: (payload: Record<string, unknown>, options: unknown) => {
          upsertPayload = payload;
          upsertOptions = options;
          upsertCalled = true;
          return {
            select: () => ({
              single: () =>
                Promise.resolve(config.upsertResult ?? { data: null, error: null }),
            }),
          };
        },
      };
    }
    throw new Error(`tabla no mockeada: ${table}`);
  });

  return {
    fromMock,
    getUpsertPayload: () => upsertPayload,
    getUpsertOptions: () => upsertOptions,
    wasUpsertCalled: () => upsertCalled,
  };
}

const LESSON_ROW = { id: "lesson-1", title: "Clase de tasación" };
const TRANSCRIPT_ROW = { content_text: "Hoy hablamos de tasación de inmuebles." };

const VALID_SUMMARY_PAYLOAD = {
  key_points: ["punto 1", "punto 2", "punto 3"],
  summary_text: "Resumen de la clase.",
  glossary: [{ term: "tasación", definition: "estimación de valor" }],
};

/** Fetch mock que responde con el `content` (string JSON o crudo) dado, en secuencia. */
function mockOpenAIFetchSequence(
  responses: Array<
    | { ok: true; content: string }
    | { ok: false; status: number; text: string | (() => Promise<string>) }
  >,
) {
  let call = 0;
  const fetchImpl: () => Promise<{
    ok: boolean;
    status: number;
    text: () => Promise<string>;
    json?: () => Promise<unknown>;
  }> = async () => {
    const resp = responses[Math.min(call, responses.length - 1)];
    call++;
    if (!resp.ok) {
      const respText = resp.text;
      const textFn: () => Promise<string> =
        typeof respText === "function" ? respText : async () => respText;
      return {
        ok: false,
        status: resp.status,
        text: textFn,
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({
        choices: [{ message: { content: resp.content } }],
      }),
    };
  };
  return vi.fn(fetchImpl);
}

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
// Validaciones tempranas (lesson / transcript)
// ---------------------------------------------------------------------------

describe("generateLessonSummary — validaciones de entrada", () => {
  it("lanza si la lección no existe", async () => {
    const { fromMock } = createAdminMock({ lesson: { data: null, error: null } });
    mockFrom.mockImplementation(fromMock);

    await expect(generateLessonSummary("lesson-1")).rejects.toThrow(
      /Lesson not found: lesson-1/,
    );
  });

  it("lanza si no hay transcripción (data null)", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: null, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(generateLessonSummary("lesson-1")).rejects.toThrow(
      /No transcript found for lesson lesson-1/,
    );
  });

  it("lanza si la transcripción tiene content_text vacío", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: { content_text: "" }, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(generateLessonSummary("lesson-1")).rejects.toThrow(
      /No transcript found for lesson lesson-1/,
    );
  });
});

// ---------------------------------------------------------------------------
// Llamada a OpenAI (callOpenAI)
// ---------------------------------------------------------------------------

describe("generateLessonSummary — llamada a OpenAI", () => {
  it("lanza si no hay OPENAI_API_KEY configurada", async () => {
    delete process.env.OPENAI_API_KEY;
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(generateLessonSummary("lesson-1")).rejects.toThrow(
      /OPENAI_API_KEY is not configured/,
    );
  });

  it("lanza con el texto de error del proveedor cuando la respuesta no es ok, sin reintentar", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    const fetchMock = mockOpenAIFetchSequence([
      { ok: false, status: 429, text: "rate limited" },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateLessonSummary("lesson-1")).rejects.toThrow(
      /OpenAI API error 429: rate limited/,
    );
    // Los errores de la API de OpenAI no se reintentan.
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
      mockOpenAIFetchSequence([
        {
          ok: false,
          status: 500,
          text: async () => {
            throw new Error("stream ya consumido");
          },
        },
      ]),
    );

    await expect(generateLessonSummary("lesson-1")).rejects.toThrow(
      /OpenAI API error 500: unknown error/,
    );
  });

  it("reintenta una vez si OpenAI devuelve contenido vacío y luego funciona bien", async () => {
    const { fromMock, wasUpsertCalled } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
      upsertResult: { data: { lesson_id: "lesson-1" }, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    // El primer intento con contenido vacío consume choices:[] (content undefined,
    // dispara "OpenAI returned empty content" y reintenta); el segundo intento
    // sí trae contenido válido.
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 1) {
        return { ok: true, status: 200, text: async () => "", json: async () => ({ choices: [] }) };
      }
      return {
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(VALID_SUMMARY_PAYLOAD) } }],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateLessonSummary("lesson-1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wasUpsertCalled()).toBe(true);
    expect(result).toEqual({ lesson_id: "lesson-1" });
  });

  it("lanza tras el segundo intento si OpenAI sigue devolviendo contenido vacío", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    // Forzamos json() a devolver choices vacío en ambas llamadas.
    const alwaysEmpty = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ choices: [] }),
    }));
    vi.stubGlobal("fetch", alwaysEmpty);

    await expect(generateLessonSummary("lesson-1")).rejects.toThrow(
      /OpenAI returned empty content/,
    );
    expect(alwaysEmpty).toHaveBeenCalledTimes(2);
  });

  it("reintenta una vez si OpenAI devuelve JSON inválido y luego funciona bien", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
      upsertResult: { data: { lesson_id: "lesson-1" }, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      const content =
        call === 1 ? "esto no es JSON valido {{{" : JSON.stringify(VALID_SUMMARY_PAYLOAD);
      return {
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({ choices: [{ message: { content } }] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateLessonSummary("lesson-1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ lesson_id: "lesson-1" });
  });

  it("lanza SyntaxError tras el segundo intento si el JSON sigue siendo inválido", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ choices: [{ message: { content: "no es json {{{" } }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateLessonSummary("lesson-1")).rejects.toThrow(SyntaxError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Transcripción corrupta
// ---------------------------------------------------------------------------

describe("generateLessonSummary — transcripción corrupta", () => {
  it("lanza 'transcript_corrupted' si el modelo reporta transcripción corrupta", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    vi.stubGlobal(
      "fetch",
      mockOpenAIFetchSequence([
        { ok: true, content: JSON.stringify({ error: "transcript_corrupted" }) },
      ]),
    );

    await expect(generateLessonSummary("lesson-1")).rejects.toThrow(
      /transcript_corrupted/,
    );
  });

  it("un valor de error distinto de 'transcript_corrupted' también se rechaza (no se guarda como resumen inválido)", async () => {
    const { fromMock, getUpsertPayload } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
      upsertResult: { data: { lesson_id: "lesson-1" }, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    vi.stubGlobal(
      "fetch",
      mockOpenAIFetchSequence([
        { ok: true, content: JSON.stringify({ error: "algo_distinto" }) },
      ]),
    );

    await expect(generateLessonSummary("lesson-1")).rejects.toThrow(
      /algo_distinto/,
    );
    expect(getUpsertPayload()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Persistencia (generation_count + upsert)
// ---------------------------------------------------------------------------

describe("generateLessonSummary — persistencia", () => {
  it("camino feliz: primera generación (sin fila previa) -> generation_count = 1", async () => {
    const { fromMock, getUpsertPayload, getUpsertOptions } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
      existingSummary: { data: null, error: null },
      upsertResult: {
        data: { lesson_id: "lesson-1", generation_count: 1 },
        error: null,
      },
    });
    mockFrom.mockImplementation(fromMock);

    vi.stubGlobal(
      "fetch",
      mockOpenAIFetchSequence([{ ok: true, content: JSON.stringify(VALID_SUMMARY_PAYLOAD) }]),
    );

    const result = await generateLessonSummary("lesson-1");

    const payload = getUpsertPayload();
    expect(payload?.generation_count).toBe(1);
    expect(payload?.lesson_id).toBe("lesson-1");
    expect(payload?.key_points).toEqual(VALID_SUMMARY_PAYLOAD.key_points);
    expect(payload?.summary_text).toBe(VALID_SUMMARY_PAYLOAD.summary_text);
    expect(payload?.glossary).toEqual(VALID_SUMMARY_PAYLOAD.glossary);
    expect(payload?.model_used).toBe("gpt-5.4-mini");
    expect(payload?.prompt_version).toBe(1);
    expect(payload?.is_manually_edited).toBe(false);
    expect(typeof payload?.generated_at).toBe("string");
    expect(getUpsertOptions()).toEqual({ onConflict: "lesson_id" });
    expect(result).toEqual({ lesson_id: "lesson-1", generation_count: 1 });
  });

  it("regeneración: fila previa con generation_count=5 -> nuevo valor es 6", async () => {
    const { fromMock, getUpsertPayload } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
      existingSummary: { data: { generation_count: 5 }, error: null },
      upsertResult: { data: { lesson_id: "lesson-1", generation_count: 6 }, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    vi.stubGlobal(
      "fetch",
      mockOpenAIFetchSequence([{ ok: true, content: JSON.stringify(VALID_SUMMARY_PAYLOAD) }]),
    );

    await generateLessonSummary("lesson-1");

    expect(getUpsertPayload()?.generation_count).toBe(6);
  });

  it("lanza si el upsert de lesson_summaries falla", async () => {
    const { fromMock } = createAdminMock({
      lesson: { data: LESSON_ROW, error: null },
      transcript: { data: TRANSCRIPT_ROW, error: null },
      upsertResult: { data: null, error: { message: "constraint violada" } },
    });
    mockFrom.mockImplementation(fromMock);

    vi.stubGlobal(
      "fetch",
      mockOpenAIFetchSequence([{ ok: true, content: JSON.stringify(VALID_SUMMARY_PAYLOAD) }]),
    );

    await expect(generateLessonSummary("lesson-1")).rejects.toThrow(
      /Failed to upsert lesson_summaries: constraint violada/,
    );
  });
});
