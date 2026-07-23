import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

const USER_ID = "b1b2c3d4-e5f6-7890-abcd-ef1234567891";
const FAKE_USER = { id: USER_ID };
const PLAYBACK_ID = "abc123XYZ";
const PROGRAM_ID = "prog1111-1111-1111-1111-111111111111";

function makeRequest(params: { id?: string; range?: string } = {}) {
  const url = new URL("http://localhost/api/video-proxy");
  if (params.id !== undefined) url.searchParams.set("id", params.id);
  const headers: Record<string, string> = {};
  if (params.range) headers.range = params.range;
  return new Request(url.toString(), { headers });
}

function makeStream(text: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

// ── Estado mutable de los mocks ─────────────────────────────

const mockState = {
  user: FAKE_USER as { id: string } | null,

  // admin.from("lessons").select().eq().single()
  lessonRow: {
    id: "lesson-1",
    module_id: "module-1",
    program_modules: { program_id: PROGRAM_ID },
  } as Record<string, unknown> | null,

  // admin.from("enrollments").select().eq().eq().in().limit().maybeSingle()
  enrollmentRow: { id: "enr-1" } as Record<string, unknown> | null,
};

function chainResolving<T>(result: { data: T | null }) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = () => chain;
  chain.limit = () => chain;
  chain.single = () => Promise.resolve(result);
  chain.maybeSingle = () => Promise.resolve(result);
  return chain;
}

function adminFrom(table: string) {
  if (table === "lessons") {
    return chainResolving({ data: mockState.lessonRow });
  }
  if (table === "enrollments") {
    return chainResolving({ data: mockState.enrollmentRow });
  }
  throw new Error(`tabla admin no mockeada: ${table}`);
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: adminFrom,
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: mockState.user } }) },
  }),
}));

// ── fetch (borde externo: Mux) ──────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function stubMuxResponse(opts: {
  ok: boolean;
  status: number;
  headers?: Record<string, string>;
  body?: ReadableStream<Uint8Array> | null;
}) {
  const headerMap = new Map(Object.entries(opts.headers ?? {}));
  mockFetch.mockResolvedValue({
    ok: opts.ok,
    status: opts.status,
    headers: { get: (key: string) => headerMap.get(key.toLowerCase()) ?? null },
    body: opts.body ?? null,
  });
}

// ── Import del handler (DESPUÉS de los mocks) ───────────────

const { GET } = await import("@/app/api/video-proxy/route");

beforeEach(() => {
  vi.clearAllMocks();
  mockState.user = FAKE_USER;
  mockState.lessonRow = {
    id: "lesson-1",
    module_id: "module-1",
    program_modules: { program_id: PROGRAM_ID },
  };
  mockState.enrollmentRow = { id: "enr-1" };
  stubMuxResponse({
    ok: true,
    status: 200,
    headers: {
      "content-type": "video/mp4",
      "content-length": "11",
    },
    body: makeStream("video-data"),
  });
});

describe("GET /api/video-proxy", () => {
  it("retorna 400 si falta el parámetro id", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid playback ID");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("retorna 400 si el id tiene caracteres no alfanuméricos", async () => {
    const res = await GET(makeRequest({ id: "abc-123" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid playback ID");
  });

  it("retorna 401 si no hay usuario autenticado", async () => {
    mockState.user = null;

    const res = await GET(makeRequest({ id: PLAYBACK_ID }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("retorna 404 si no existe una lección con ese playback ID", async () => {
    mockState.lessonRow = null;

    const res = await GET(makeRequest({ id: PLAYBACK_ID }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Video not found");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("retorna 404 si la lección no tiene módulo/programa asociado", async () => {
    mockState.lessonRow = {
      id: "lesson-1",
      module_id: "module-1",
      program_modules: null,
    };

    const res = await GET(makeRequest({ id: PLAYBACK_ID }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Module not found");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("retorna 403 si el usuario no está matriculado en el programa", async () => {
    mockState.enrollmentRow = null;

    const res = await GET(makeRequest({ id: PLAYBACK_ID }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Not enrolled in this program");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("hace fetch a Mux sin cabecera Range cuando la petición no la trae", async () => {
    const res = await GET(makeRequest({ id: PLAYBACK_ID }));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      `https://stream.mux.com/${PLAYBACK_ID}/medium.mp4`,
      undefined,
    );
  });

  it("reenvía la cabecera Range a Mux cuando la petición la trae", async () => {
    const res = await GET(makeRequest({ id: PLAYBACK_ID, range: "bytes=0-99" }));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      `https://stream.mux.com/${PLAYBACK_ID}/medium.mp4`,
      { headers: { Range: "bytes=0-99" } },
    );
  });

  it("propaga el status de error de Mux cuando la respuesta no es ok", async () => {
    stubMuxResponse({ ok: false, status: 404 });

    const res = await GET(makeRequest({ id: PLAYBACK_ID }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Video not available");
    expect(json.status).toBe(404);
  });

  it("propaga un status 5xx de Mux tal cual", async () => {
    stubMuxResponse({ ok: false, status: 502 });

    const res = await GET(makeRequest({ id: PLAYBACK_ID }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.status).toBe(502);
  });

  it("en el camino feliz retorna 200 con el body y las cabeceras de Mux", async () => {
    stubMuxResponse({
      ok: true,
      status: 200,
      headers: {
        "content-type": "video/mp4",
        "content-length": "10",
        "content-range": "bytes 0-9/100",
      },
      body: makeStream("video-data-"),
    });

    const res = await GET(makeRequest({ id: PLAYBACK_ID }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Range")).toBe("bytes 0-9/100");
    expect(res.headers.get("Content-Length")).toBe("10");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    const text = await res.text();
    expect(text).toBe("video-data-");
  });

  it("responde 206 y copia Content-Range cuando Mux responde con contenido parcial", async () => {
    stubMuxResponse({
      ok: true,
      status: 206,
      headers: {
        "content-type": "video/mp4",
        "content-range": "bytes 0-99/1000",
        "content-length": "100",
      },
      body: makeStream("partial"),
    });

    const res = await GET(makeRequest({ id: PLAYBACK_ID, range: "bytes=0-99" }));
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-99/1000");
  });

  it("usa video/mp4 por defecto si Mux no envía Content-Type", async () => {
    stubMuxResponse({ ok: true, status: 200, headers: {}, body: makeStream("x") });

    const res = await GET(makeRequest({ id: PLAYBACK_ID }));
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
  });

  it("no fija Content-Range si Mux no la envía", async () => {
    stubMuxResponse({
      ok: true,
      status: 200,
      headers: { "content-type": "video/mp4" },
      body: makeStream("x"),
    });

    const res = await GET(makeRequest({ id: PLAYBACK_ID }));
    expect(res.headers.get("Content-Range")).toBeNull();
  });

  it("no fija Content-Length si Mux no la envía", async () => {
    stubMuxResponse({
      ok: true,
      status: 200,
      headers: { "content-type": "video/mp4" },
      body: makeStream("x"),
    });

    const res = await GET(makeRequest({ id: PLAYBACK_ID }));
    expect(res.headers.get("Content-Length")).toBeNull();
  });
});
