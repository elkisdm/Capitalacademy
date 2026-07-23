import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

const { correctTranscript } = await import("@/lib/classroom/correct-transcript");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CorrectionItem = {
  index: number;
  corrected: string;
  changed: boolean;
  needs_review: boolean;
  review_reason: string | null;
};

interface AdminMockConfig {
  transcript: { data: unknown; error: unknown };
  existingSegments?: { data: unknown; error?: unknown };
  upsertError?: { message: string } | null;
  updateError?: { message: string } | null;
}

/** Simula `admin.from(...)` para las dos tablas que usa correctTranscript. */
function createAdminMock(config: AdminMockConfig) {
  const upsertCalls: Array<{ rows: unknown[]; options: unknown }> = [];
  let updatePayload: Record<string, unknown> | null = null;
  let updateCalled = false;

  const fromMock = vi.fn((table: string) => {
    if (table === "lesson_transcripts") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () => Promise.resolve(config.transcript),
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          updateCalled = true;
          return {
            eq: () => Promise.resolve({ error: config.updateError ?? null }),
          };
        },
      };
    }
    if (table === "transcript_segments") {
      return {
        select: () => ({
          eq: () => ({
            eq: () =>
              Promise.resolve(
                config.existingSegments ?? { data: null, error: null },
              ),
          }),
        }),
        upsert: (rows: unknown[], options: unknown) => {
          upsertCalls.push({ rows, options });
          return Promise.resolve({ error: config.upsertError ?? null });
        },
      };
    }
    throw new Error(`tabla no mockeada: ${table}`);
  });

  return {
    fromMock,
    upsertCalls,
    getUpdatePayload: () => updatePayload,
    wasUpdateCalled: () => updateCalled,
  };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}

function secondsToTimestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(ms)}`;
}

function buildVTT(cues: Array<{ start: number; end: number; text: string }>): string {
  const body = cues
    .map(
      (c) =>
        `${secondsToTimestamp(c.start)} --> ${secondsToTimestamp(c.end)}\n${c.text}`,
    )
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

/** Fetch mock que responde según los segmentos recibidos en el request de OpenAI. */
function mockOpenAIFetch(
  buildCorrections: (segs: Array<{ index: number; text: string }>) => CorrectionItem[],
) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const segs = JSON.parse(body.messages[1].content) as Array<{
      index: number;
      text: string;
    }>;
    const corrections = buildCorrections(segs);
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ corrections }) } }],
      }),
    };
  });
}

const VALID_VTT = buildVTT([
  { start: 0, end: 2, text: "Opramos casa" },
  { start: 2, end: 4, text: "hicimo el negocio" },
]);

const TRANSCRIPT_ROW = {
  id: "transcript-1",
  content_vtt: VALID_VTT,
  content_text: "texto plano",
};

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
// Fetch del transcript / validaciones tempranas
// ---------------------------------------------------------------------------

describe("correctTranscript — validaciones de entrada", () => {
  it("lanza un error distinto de 'no encontrado' si la consulta del transcript falla (no confunde fallo de red con transcripción inexistente)", async () => {
    const { fromMock } = createAdminMock({
      transcript: { data: null, error: { message: "boom" } },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(correctTranscript("lesson-1")).rejects.toThrow(
      /Failed to fetch transcript for lesson lesson-1: boom/,
    );
  });

  it("no lanza el error crudo del proveedor cuando la consulta falla por un código distinto a 'sin filas' (PGRST116)", async () => {
    const { fromMock } = createAdminMock({
      transcript: { data: null, error: { message: "boom", code: "PGRST116" } },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(correctTranscript("lesson-1")).rejects.toThrow(
      /No transcript found for lesson lesson-1/,
    );
  });

  it("lanza si el transcript no existe (sin error, pero data null)", async () => {
    const { fromMock } = createAdminMock({
      transcript: { data: null, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(correctTranscript("lesson-1")).rejects.toThrow(
      /No transcript found for lesson lesson-1/,
    );
  });

  it("lanza si el transcript no tiene content_vtt", async () => {
    const { fromMock } = createAdminMock({
      transcript: { data: { ...TRANSCRIPT_ROW, content_vtt: null }, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(correctTranscript("lesson-1")).rejects.toThrow(
      /has no VTT content/,
    );
  });

  it("lanza si el VTT no produce segmentos", async () => {
    const { fromMock } = createAdminMock({
      transcript: {
        data: { ...TRANSCRIPT_ROW, content_vtt: "WEBVTT\n\n" },
        error: null,
      },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(correctTranscript("lesson-1")).rejects.toThrow(
      /Parsed 0 segments from VTT for lesson lesson-1/,
    );
  });
});

// ---------------------------------------------------------------------------
// Llamada a OpenAI (callOpenAI)
// ---------------------------------------------------------------------------

describe("correctTranscript — llamada a OpenAI", () => {
  it("lanza si no hay OPENAI_API_KEY configurada", async () => {
    delete process.env.OPENAI_API_KEY;
    const { fromMock } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(correctTranscript("lesson-1")).rejects.toThrow(
      /OPENAI_API_KEY is not configured/,
    );
  });

  it("lanza con el texto de error del proveedor cuando la respuesta no es ok", async () => {
    const { fromMock } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "rate limited",
      }),
    );

    await expect(correctTranscript("lesson-1")).rejects.toThrow(
      /OpenAI API error 429: rate limited/,
    );
  });

  it("usa 'unknown error' si la respuesta no-ok tampoco puede leer el texto", async () => {
    const { fromMock } = createAdminMock({
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

    await expect(correctTranscript("lesson-1")).rejects.toThrow(
      /OpenAI API error 500: unknown error/,
    );
  });

  it("lanza si OpenAI devuelve contenido vacío", async () => {
    const { fromMock } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({ choices: [] }),
      }),
    );

    await expect(correctTranscript("lesson-1")).rejects.toThrow(
      /OpenAI returned empty content/,
    );
  });
});

// ---------------------------------------------------------------------------
// Batching (callOpenAIBatched)
// ---------------------------------------------------------------------------

describe("correctTranscript — batching de OpenAI", () => {
  it("con <=50 segmentos hace una sola llamada a fetch", async () => {
    const { fromMock } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    const fetchMock = mockOpenAIFetch((segs) =>
      segs.map((s) => ({
        index: s.index,
        corrected: s.text,
        changed: false,
        needs_review: false,
        review_reason: null,
      })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await correctTranscript("lesson-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.totalSegments).toBe(2);
  });

  it("con >100 segmentos divide en batches de 50 y llama fetch secuencialmente", async () => {
    const cues = Array.from({ length: 105 }, (_, i) => ({
      start: i * 2,
      end: i * 2 + 1,
      text: `Texto numero ${i}`,
    }));
    const bigVtt = buildVTT(cues);

    const { fromMock } = createAdminMock({
      transcript: { data: { ...TRANSCRIPT_ROW, content_vtt: bigVtt }, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    const fetchMock = mockOpenAIFetch((segs) =>
      segs.map((s) => ({
        index: s.index,
        corrected: s.text,
        changed: false,
        needs_review: false,
        review_reason: null,
      })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await correctTranscript("lesson-1");

    // 105 segmentos / BATCH_SIZE 50 => 3 llamadas (50 + 50 + 5)
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.totalSegments).toBe(105);
  });
});

// ---------------------------------------------------------------------------
// Lógica de corrección + persistencia
// ---------------------------------------------------------------------------

describe("correctTranscript — lógica de corrección", () => {
  it("camino feliz: corrige ambos segmentos y persiste totales correctos", async () => {
    const { fromMock, upsertCalls, getUpdatePayload } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    vi.stubGlobal(
      "fetch",
      mockOpenAIFetch(() => [
        {
          index: 0,
          corrected: "Compramos casa",
          changed: true,
          needs_review: false,
          review_reason: null,
        },
        {
          index: 1,
          corrected: "hicimos el negocio",
          changed: true,
          needs_review: true,
          review_reason: "baja confianza",
        },
      ]),
    );

    const result = await correctTranscript("lesson-1");

    expect(result).toEqual({
      corrected: true,
      totalSegments: 2,
      changedSegments: 2,
      needsReview: 1,
    });

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].rows).toHaveLength(2);
    expect(upsertCalls[0].options).toEqual({
      onConflict: "transcript_id,segment_index",
    });

    const payload = getUpdatePayload();
    expect(payload?.correction_status).toBe("corrected");
    expect(payload?.segments_needing_review).toBe(1);
    expect(payload?.corrected_text).toBe("Compramos casa hicimos el negocio");
  });

  it("ignora segmentos sin corrección devuelta por OpenAI (index sin match)", async () => {
    const { fromMock, upsertCalls } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    // Solo devuelve corrección para el índice 0; el índice 1 queda sin match.
    vi.stubGlobal(
      "fetch",
      mockOpenAIFetch(() => [
        {
          index: 0,
          corrected: "Compramos casa",
          changed: true,
          needs_review: false,
          review_reason: null,
        },
      ]),
    );

    const result = await correctTranscript("lesson-1");

    expect(result.changedSegments).toBe(1);
    expect(upsertCalls[0].rows).toHaveLength(1);
    expect(upsertCalls[0].rows[0]).toMatchObject({ segment_index: 0 });
  });

  it("no sobrescribe un segmento editado manualmente aunque OpenAI lo cambie", async () => {
    const { fromMock, upsertCalls, getUpdatePayload } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
      existingSegments: { data: [{ segment_index: 0 }], error: null },
    });
    mockFrom.mockImplementation(fromMock);

    vi.stubGlobal(
      "fetch",
      mockOpenAIFetch(() => [
        {
          index: 0,
          corrected: "Compramos casa",
          changed: true,
          needs_review: false,
          review_reason: null,
        },
        {
          index: 1,
          corrected: "hicimos el negocio",
          changed: true,
          needs_review: false,
          review_reason: null,
        },
      ]),
    );

    const result = await correctTranscript("lesson-1");

    // Solo el segmento 1 se cuenta como cambiado; el 0 se saltó por edición manual.
    expect(result.changedSegments).toBe(1);
    expect(upsertCalls[0].rows).toHaveLength(1);
    expect(upsertCalls[0].rows[0]).toMatchObject({ segment_index: 1 });

    // El texto corregido final conserva el original del segmento editado manualmente.
    const payload = getUpdatePayload();
    expect(payload?.corrected_text).toBe("Opramos casa hicimos el negocio");
  });

  it("changed:false y no editado manualmente -> upsert con corrected_text null", async () => {
    const { fromMock, upsertCalls } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    vi.stubGlobal(
      "fetch",
      mockOpenAIFetch((segs) =>
        segs.map((s) => ({
          index: s.index,
          corrected: s.text,
          changed: false,
          needs_review: false,
          review_reason: null,
        })),
      ),
    );

    const result = await correctTranscript("lesson-1");

    expect(result.changedSegments).toBe(0);
    expect(result.needsReview).toBe(0);
    expect(upsertCalls[0].rows).toHaveLength(2);
    for (const row of upsertCalls[0].rows as Array<Record<string, unknown>>) {
      expect(row.corrected_text).toBeNull();
      expect(row.needs_review).toBe(false);
    }
  });

  it("changed:false y editado manualmente -> no agrega fila de upsert para ese segmento", async () => {
    const { fromMock, upsertCalls } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
      existingSegments: { data: [{ segment_index: 0 }, { segment_index: 1 }], error: null },
    });
    mockFrom.mockImplementation(fromMock);

    vi.stubGlobal(
      "fetch",
      mockOpenAIFetch((segs) =>
        segs.map((s) => ({
          index: s.index,
          corrected: s.text,
          changed: false,
          needs_review: false,
          review_reason: null,
        })),
      ),
    );

    await correctTranscript("lesson-1");

    // Ambos segmentos están editados manualmente y sin cambios -> no hay filas que upsertear
    // y por lo tanto el bloque de upsert nunca se ejecuta.
    expect(upsertCalls).toHaveLength(0);
  });

  it("existingSegments con data null (?? []) no rompe y no marca nada como editado", async () => {
    const { fromMock } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
      existingSegments: { data: null, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    vi.stubGlobal(
      "fetch",
      mockOpenAIFetch(() => [
        {
          index: 0,
          corrected: "Compramos casa",
          changed: true,
          needs_review: false,
          review_reason: null,
        },
        {
          index: 1,
          corrected: "hicimo el negocio",
          changed: false,
          needs_review: false,
          review_reason: null,
        },
      ]),
    );

    const result = await correctTranscript("lesson-1");
    expect(result.changedSegments).toBe(1);
  });

  it("lanza si falla la consulta de segmentos editados manualmente (no debe interpretar el fallo como 'nadie editó nada')", async () => {
    const { fromMock } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
      existingSegments: { data: null, error: { message: "timeout" } },
    });
    mockFrom.mockImplementation(fromMock);

    await expect(correctTranscript("lesson-1")).rejects.toThrow(
      /Failed to fetch manually edited segments: timeout/,
    );
  });

  it("lanza si el upsert de transcript_segments falla", async () => {
    const { fromMock } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
      upsertError: { message: "constraint violada" },
    });
    mockFrom.mockImplementation(fromMock);

    vi.stubGlobal(
      "fetch",
      mockOpenAIFetch(() => [
        {
          index: 0,
          corrected: "Compramos casa",
          changed: true,
          needs_review: false,
          review_reason: null,
        },
        {
          index: 1,
          corrected: "hicimos el negocio",
          changed: true,
          needs_review: false,
          review_reason: null,
        },
      ]),
    );

    await expect(correctTranscript("lesson-1")).rejects.toThrow(
      /Failed to batch upsert transcript_segments: constraint violada/,
    );
  });

  it("lanza si falla el update de lesson_transcripts", async () => {
    const { fromMock } = createAdminMock({
      transcript: { data: TRANSCRIPT_ROW, error: null },
      updateError: { message: "columna no existe" },
    });
    mockFrom.mockImplementation(fromMock);

    vi.stubGlobal(
      "fetch",
      mockOpenAIFetch(() => [
        {
          index: 0,
          corrected: "Compramos casa",
          changed: true,
          needs_review: false,
          review_reason: null,
        },
        {
          index: 1,
          corrected: "hicimos el negocio",
          changed: true,
          needs_review: false,
          review_reason: null,
        },
      ]),
    );

    await expect(correctTranscript("lesson-1")).rejects.toThrow(
      /Failed to update lesson_transcripts: columna no existe/,
    );
  });
});

// ---------------------------------------------------------------------------
// Reconstrucción del VTT (rebuildVTT, vía el efecto observable en el update)
// ---------------------------------------------------------------------------

describe("correctTranscript — reconstrucción del VTT", () => {
  it("un cue cuyo texto se reduce a vacío tras quitar tags no desalinea las correcciones siguientes", async () => {
    // parseVTT descarta (sin asignar índice) cualquier cue cuyo texto, luego
    // de remover tags HTML, queda vacío — ej. un cue "<i></i>". rebuildVTT
    // replica ese mismo filtro, así que ese bloque tampoco consume un índice
    // de `segments` y las correcciones siguientes se escriben en el bloque
    // correcto del VTT reconstruido.
    const vttConEmptyCue = buildVTT([
      { start: 0, end: 2, text: "Hola" },
      { start: 2, end: 4, text: "<i></i>" },
      { start: 4, end: 6, text: "Chao" },
    ]);

    const { fromMock, getUpdatePayload } = createAdminMock({
      transcript: { data: { ...TRANSCRIPT_ROW, content_vtt: vttConEmptyCue }, error: null },
    });
    mockFrom.mockImplementation(fromMock);

    // parseVTT solo produce 2 segmentos reales: index 0 "Hola", index 1 "Chao"
    // (el cue "<i></i>" no genera segmento).
    vi.stubGlobal(
      "fetch",
      mockOpenAIFetch(() => [
        {
          index: 0,
          corrected: "Hola corregido",
          changed: true,
          needs_review: false,
          review_reason: null,
        },
        {
          index: 1,
          corrected: "Chao corregido",
          changed: true,
          needs_review: false,
          review_reason: null,
        },
      ]),
    );

    await correctTranscript("lesson-1");

    const payload = getUpdatePayload();
    const correctedVtt = payload?.corrected_vtt as string;

    // Comportamiento correcto: el cue vacío ("<i></i>") se mantiene sin
    // tocar, y el bloque que originalmente decía "Chao" es el que recibe
    // su corrección — no queda corrido hacia el bloque equivocado.
    expect(correctedVtt).toContain("<i></i>");
    expect(correctedVtt).toContain("Chao corregido");
    const blocks = correctedVtt.trim().split(/\n\n+/);
    const lastBlock = blocks[blocks.length - 1];
    expect(lastBlock.endsWith("Chao corregido")).toBe(true);
  });
});
