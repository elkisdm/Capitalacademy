import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";

// --- Mock de autorización ---------------------------------------------------
let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

// --- Mock del cliente admin de Supabase -------------------------------------
type SegmentsSelectResult = { data: unknown[] | null; error: unknown };
type UpdateSelectSingleResult = { data: unknown | null; error: unknown };
type CountResult = { count: number | null; error: unknown };
type SimpleResult = { error: unknown };

type State = {
  // GET: select("*, lesson_transcripts!inner(lesson_id)")
  getSegmentsResult: SegmentsSelectResult;
  // PATCH paso 1: update(...).eq(...).select(...).single()
  updateStepResult: UpdateSelectSingleResult;
  // PATCH paso 2: select(columnas planas).eq(transcript_id).order(...)
  allSegmentsResult: SegmentsSelectResult;
  // PATCH paso 2b: select("id", {count:"exact", head:true})
  countResult: CountResult;
  // PATCH paso 3: lesson_transcripts.update(...).eq(...)
  transcriptUpdateResult: SimpleResult;
};
let state: State;

let capturedSegmentUpdate: Record<string, unknown> | null;
let capturedTranscriptUpdate: Record<string, unknown> | null;
let allEqCalls: [string, unknown][];

function makeBuilder(table: string) {
  let selectArg: string | undefined;
  let selectOpts: { count?: string; head?: boolean } | undefined;
  let hasUpdate = false;

  const builder: Record<string, unknown> = {};

  builder.select = (arg?: string, opts?: { count?: string; head?: boolean }) => {
    selectArg = arg;
    selectOpts = opts;
    return builder;
  };
  builder.eq = (col: string, val: unknown) => {
    allEqCalls.push([col, val]);
    return builder;
  };
  builder.order = () => builder;

  builder.update = (arg: Record<string, unknown>) => {
    hasUpdate = true;
    if (table === "transcript_segments") capturedSegmentUpdate = arg;
    if (table === "lesson_transcripts") capturedTranscriptUpdate = arg;
    return builder;
  };

  const resolve = () => {
    if (table === "transcript_segments") {
      if (hasUpdate) return state.updateStepResult;
      if (selectOpts?.count === "exact") return state.countResult;
      if (selectArg?.includes("lesson_transcripts!inner")) return state.getSegmentsResult;
      return state.allSegmentsResult;
    }
    if (table === "lesson_transcripts") {
      return state.transcriptUpdateResult;
    }
    return { data: null, error: null };
  };

  builder.single = () => Promise.resolve(resolve());
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeBuilder(table) })),
}));

const { GET, PATCH } = await import("@/app/api/admin/transcript-segments/route");

const LESSON_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const SEGMENT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";
const TRANSCRIPT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-333333333333";

function getReq(qs: string) {
  return new Request(`http://x/api/admin/transcript-segments${qs}`);
}
function jsonReq(body: unknown) {
  return new Request("http://x/api/admin/transcript-segments", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function rawReq(rawBody: string) {
  return new Request("http://x/api/admin/transcript-segments", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

const authOk = () => ({ user: { id: "staff-1" } });
const authDenied = () => ({
  error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
});

beforeEach(() => {
  vi.clearAllMocks();
  authResult = authOk();
  capturedSegmentUpdate = null;
  capturedTranscriptUpdate = null;
  allEqCalls = [];
  state = {
    getSegmentsResult: {
      data: [{ id: "s1", segment_index: 0 }],
      error: null,
    },
    updateStepResult: {
      data: {
        id: SEGMENT_ID,
        corrected_text: "texto corregido",
        lesson_transcripts: { id: TRANSCRIPT_ID, lesson_id: LESSON_ID },
      },
      error: null,
    },
    allSegmentsResult: {
      data: [
        {
          segment_index: 0,
          start_seconds: 0,
          end_seconds: 5.25,
          original_text: "Hola",
          corrected_text: null,
        },
        {
          segment_index: 1,
          start_seconds: 3661.5,
          end_seconds: 3665,
          original_text: "Mundo",
          corrected_text: "Mundo corregido",
        },
      ],
      error: null,
    },
    countResult: { count: 3, error: null },
    transcriptUpdateResult: { error: null },
  };
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/admin/transcript-segments", () => {
  it("401 cuando no está autenticado", async () => {
    authResult = authDenied();
    const res = await GET(getReq(`?lessonId=${LESSON_ID}`));
    expect(res!.status).toBe(401);
  });

  it("422 cuando falta lessonId", async () => {
    const res = await GET(getReq(""));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toMatch(/lessonId/);
  });

  it("200 devuelve los segmentos sin filtro needsReview", async () => {
    const res = await GET(getReq(`?lessonId=${LESSON_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.segments).toHaveLength(1);
    // No se agregó el filtro needs_review porque needsReview no vino "true".
    expect(allEqCalls.some(([col]) => col === "needs_review")).toBe(false);
  });

  it("200 aplica el filtro needs_review cuando needsReview=true", async () => {
    const res = await GET(getReq(`?lessonId=${LESSON_ID}&needsReview=true`));
    expect(res!.status).toBe(200);
    expect(allEqCalls).toContainEqual(["needs_review", true]);
  });

  it("no aplica el filtro needs_review cuando el valor no es exactamente 'true'", async () => {
    const res = await GET(getReq(`?lessonId=${LESSON_ID}&needsReview=false`));
    expect(res!.status).toBe(200);
    expect(allEqCalls.some(([col]) => col === "needs_review")).toBe(false);
  });

  it("500 cuando la consulta falla", async () => {
    state.getSegmentsResult = { data: null, error: { message: "boom" } };
    const res = await GET(getReq(`?lessonId=${LESSON_ID}`));
    expect(res!.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/transcript-segments", () => {
  it("401 cuando no está autenticado", async () => {
    authResult = authDenied();
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID, correctedText: "x" }));
    expect(res!.status).toBe(401);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const res = await PATCH(rawReq("{esto no es json"));
    expect(res!.status).toBe(400);
  });

  it("422 cuando falta segmentId", async () => {
    const res = await PATCH(jsonReq({ correctedText: "x" }));
    expect(res!.status).toBe(422);
  });

  it("422 cuando correctedText es null/undefined", async () => {
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID }));
    expect(res!.status).toBe(422);
  });

  it("500 cuando falla la actualización del segmento (error del proveedor)", async () => {
    state.updateStepResult = { data: null, error: { message: "boom" } };
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID, correctedText: "x" }));
    expect(res!.status).toBe(500);
  });

  it("500 cuando la actualización no devuelve fila (sin error explícito)", async () => {
    state.updateStepResult = { data: null, error: null };
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID, correctedText: "x" }));
    expect(res!.status).toBe(500);
  });

  it("500 cuando falla la reconstrucción de la transcripción completa (error del proveedor)", async () => {
    state.allSegmentsResult = { data: null, error: { message: "boom" } };
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID, correctedText: "x" }));
    expect(res!.status).toBe(500);
  });

  it("500 cuando la reconstrucción no devuelve segmentos (sin error explícito)", async () => {
    state.allSegmentsResult = { data: null, error: null };
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID, correctedText: "x" }));
    expect(res!.status).toBe(500);
  });

  it("500 cuando falla la actualización de lesson_transcripts", async () => {
    state.transcriptUpdateResult = { error: { message: "boom" } };
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID, correctedText: "x" }));
    expect(res!.status).toBe(500);
  });

  it("200 acepta correctedText vacío (solo se valida == null, no falsy)", async () => {
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID, correctedText: "" }));
    expect(res!.status).toBe(200);
    expect(capturedSegmentUpdate?.corrected_text).toBe("");
  });

  it("200 actualiza el segmento marcándolo como editado manualmente por el caller", async () => {
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID, correctedText: "texto corregido" }));
    expect(res!.status).toBe(200);
    expect(capturedSegmentUpdate?.corrected_text).toBe("texto corregido");
    expect(capturedSegmentUpdate?.manually_edited).toBe(true);
    expect(capturedSegmentUpdate?.edited_by).toBe("staff-1");
    expect(capturedSegmentUpdate?.needs_review).toBe(false);
    expect(typeof capturedSegmentUpdate?.edited_at).toBe("string");
  });

  it("200 reconstruye texto completo y VTT combinando corrected_text/original_text con formato de tiempo HH:MM:SS.mmm", async () => {
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID, correctedText: "texto corregido" }));
    expect(res!.status).toBe(200);

    // segmento 0: sin corrected_text -> usa original_text; start=0 (sin horas)
    // segmento 1: con corrected_text; start=3661.5s = 01:01:01.500 (con horas)
    expect(capturedTranscriptUpdate?.corrected_text).toBe("Hola\nMundo corregido");
    expect(capturedTranscriptUpdate?.corrected_vtt).toBe(
      [
        "WEBVTT",
        "",
        "1",
        "00:00:00.000 --> 00:00:05.250",
        "Hola",
        "",
        "2",
        "01:01:01.500 --> 01:01:05.000",
        "Mundo corregido",
        "",
      ].join("\n"),
    );
  });

  it("200 propaga el conteo de segmentos pendientes de revisión a lesson_transcripts", async () => {
    state.countResult = { count: 3, error: null };
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID, correctedText: "x" }));
    expect(res!.status).toBe(200);
    expect(capturedTranscriptUpdate?.segments_needing_review).toBe(3);
  });

  it("200 usa 0 cuando el conteo de pendientes de revisión viene null", async () => {
    state.countResult = { count: null, error: null };
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID, correctedText: "x" }));
    expect(res!.status).toBe(200);
    expect(capturedTranscriptUpdate?.segments_needing_review).toBe(0);
  });

  it("200 devuelve el segmento actualizado en el body", async () => {
    const res = await PATCH(jsonReq({ segmentId: SEGMENT_ID, correctedText: "x" }));
    const json = await res!.json();
    expect(json.segment.id).toBe(SEGMENT_ID);
  });
});
