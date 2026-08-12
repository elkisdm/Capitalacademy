import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

type Result = { data: unknown; error?: unknown };

// Estado configurable por prueba para cada paso de la cadena Supabase.
let existingLessonResult: Result;
let updateReadyResult: Result;
let trackReadyLessonResult: Result;
let trackUpdateResult: Result;
let transcriptUpsertResult: Result;
let recordedCalls: Array<{
  op: string;
  table: string;
  col?: string;
  val?: unknown;
  obj?: Record<string, unknown>;
}>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "lessons") {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              recordedCalls.push({ op: "select.eq", table, col, val });
              return {
                maybeSingle: () => Promise.resolve(existingLessonResult),
                single: () => Promise.resolve(trackReadyLessonResult),
              };
            },
          }),
          update: (obj: Record<string, unknown>) => ({
            eq: (col: string, val: unknown) => {
              recordedCalls.push({ op: "update.eq", table, col, val, obj });
              const plain: Result =
                "mux_track_id" in obj ? trackUpdateResult : { data: null, error: null };
              // eq() es "thenable" en supabase-js: puede awaitearse directo
              // (mux_error / asset.deleted / mux_track_id) o encadenar .select()
              // (video.asset.ready). Replicamos ambos caminos.
              const promise = Promise.resolve(plain) as Promise<Result> & {
                select: (cols: string) => Promise<Result>;
              };
              promise.select = () => Promise.resolve(updateReadyResult);
              return promise;
            },
          }),
        };
      }
      if (table === "lesson_transcripts") {
        return {
          upsert: (obj: Record<string, unknown>, opts: Record<string, unknown>) => {
            recordedCalls.push({ op: "upsert", table, obj: { ...obj, ...opts } });
            return Promise.resolve(transcriptUpsertResult);
          },
        };
      }
      throw new Error(`tabla inesperada en el mock: ${table}`);
    },
  })),
}));

vi.mock("@/lib/mux/smart-thumbnail", () => ({
  pickSmartThumbnailTime: vi.fn(),
}));
vi.mock("@/lib/classroom/recording-notifications", () => ({
  dispatchCapacitacionFollowup: vi.fn(),
  dispatchRecordingAvailableNotification: vi.fn(),
}));
vi.mock("@/lib/classroom/correct-transcript", () => ({
  correctTranscript: vi.fn(),
}));
vi.mock("@/lib/classroom/generate-summary", () => ({
  generateLessonSummary: vi.fn(),
}));
vi.mock("@/lib/classroom/generate-chapters", () => ({
  generateLessonChapters: vi.fn(),
}));

const { pickSmartThumbnailTime } = await import("@/lib/mux/smart-thumbnail");
const { dispatchCapacitacionFollowup, dispatchRecordingAvailableNotification } = await import(
  "@/lib/classroom/recording-notifications"
);
const { correctTranscript } = await import("@/lib/classroom/correct-transcript");
const { generateLessonSummary } = await import("@/lib/classroom/generate-summary");
const { generateLessonChapters } = await import("@/lib/classroom/generate-chapters");
const { POST } = await import("@/app/api/webhooks/mux/route");

const mPickSmartThumbnailTime = vi.mocked(pickSmartThumbnailTime);
const mDispatchCapacitacionFollowup = vi.mocked(dispatchCapacitacionFollowup);
const mDispatchRecordingAvailableNotification = vi.mocked(dispatchRecordingAvailableNotification);
const mCorrectTranscript = vi.mocked(correctTranscript);
const mGenerateLessonSummary = vi.mocked(generateLessonSummary);
const mGenerateLessonChapters = vi.mocked(generateLessonChapters);

const ORIGINAL_SECRET = process.env.MUX_WEBHOOK_SECRET;

function jsonRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/webhooks/mux", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Construye un Request con firma HMAC válida (o deliberadamente inválida) para un secreto dado. */
function signedRequest(
  body: unknown,
  secret: string,
  opts?: { timestampSec?: number; signatureOverride?: string; headerOverride?: string },
): Request {
  const raw = JSON.stringify(body);
  const timestampSec = opts?.timestampSec ?? Math.floor(Date.now() / 1000);
  const expected = createHmac("sha256", secret).update(`${timestampSec}.${raw}`).digest("hex");
  const signature = opts?.signatureOverride ?? expected;
  const header = opts?.headerOverride ?? `t=${timestampSec},v1=${signature}`;
  return new Request("http://localhost/api/webhooks/mux", {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", "mux-signature": header },
  });
}

describe("POST /api/webhooks/mux", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedCalls = [];
    // La lección matchea por defecto (sin miniatura previa): desde el retorno
    // temprano, `data: null` significa "asset ajeno" y corta el flujo entero.
    existingLessonResult = { data: { thumbnail_url: null } };
    updateReadyResult = { data: [{ id: "lesson-1" }], error: null };
    trackReadyLessonResult = { data: { id: "lesson-1", mux_playback_id: "pb-1" } };
    trackUpdateResult = { data: null, error: null };
    transcriptUpsertResult = { data: null, error: null };

    delete process.env.MUX_WEBHOOK_SECRET;
    vi.stubEnv("NODE_ENV", "test");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, text: async () => "" })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (ORIGINAL_SECRET === undefined) delete process.env.MUX_WEBHOOK_SECRET;
    else process.env.MUX_WEBHOOK_SECRET = ORIGINAL_SECRET;
  });

  // ---------------------------------------------------------------------
  // Lectura de body y verificación de firma
  // ---------------------------------------------------------------------

  it("responde 400 si el body no puede leerse como texto", async () => {
    const brokenReq = {
      text: () => Promise.reject(new Error("stream roto")),
      headers: { get: () => null },
    } as unknown as Request;

    const res = await POST(brokenReq);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid body" });
  });

  it("responde 400 si el body no es JSON válido", async () => {
    const req = new Request("http://localhost/api/webhooks/mux", {
      method: "POST",
      body: "no-es-json{",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid body" });
  });

  it("responde 401 si hay secreto configurado pero falta el header de firma", async () => {
    process.env.MUX_WEBHOOK_SECRET = "shh";
    const res = await POST(jsonRequest({ type: "video.asset.deleted", data: { id: "a1" } }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Missing signature" });
  });

  it("responde 401 si el header de firma está malformado (sin t= o v1=)", async () => {
    process.env.MUX_WEBHOOK_SECRET = "shh";
    const body = { type: "video.asset.deleted", data: { id: "a1" } };
    const res = await POST(
      signedRequest(body, "shh", { headerOverride: "v1=deadbeef" }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid signature" });
  });

  it("responde 401 si el timestamp de la firma no es numérico", async () => {
    process.env.MUX_WEBHOOK_SECRET = "shh";
    const body = { type: "video.asset.deleted", data: { id: "a1" } };
    const res = await POST(
      signedRequest(body, "shh", { headerOverride: "t=abc,v1=deadbeef" }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid signature" });
  });

  it("responde 401 si el timestamp es más viejo que la ventana de replay (5 min)", async () => {
    process.env.MUX_WEBHOOK_SECRET = "shh";
    const body = { type: "video.asset.deleted", data: { id: "a1" } };
    const oldTimestamp = Math.floor(Date.now() / 1000) - 6 * 60;
    const res = await POST(signedRequest(body, "shh", { timestampSec: oldTimestamp }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid signature" });
  });

  it("responde 401 si la firma recibida tiene largo distinto a la esperada", async () => {
    process.env.MUX_WEBHOOK_SECRET = "shh";
    const body = { type: "video.asset.deleted", data: { id: "a1" } };
    const res = await POST(signedRequest(body, "shh", { signatureOverride: "abcd" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid signature" });
  });

  it("responde 401 si la firma tiene el largo correcto pero el contenido no coincide", async () => {
    process.env.MUX_WEBHOOK_SECRET = "shh";
    const body = { type: "video.asset.deleted", data: { id: "a1" } };
    const wrongButSameLength = "0".repeat(64);
    const res = await POST(signedRequest(body, "shh", { signatureOverride: wrongButSameLength }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid signature" });
  });

  it("procesa el webhook cuando la firma es válida", async () => {
    process.env.MUX_WEBHOOK_SECRET = "shh";
    const body = { type: "video.asset.deleted", data: { id: "a1" } };
    const res = await POST(signedRequest(body, "shh"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("responde 500 (fail-closed) sin secreto configurado en producción", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.MUX_WEBHOOK_SECRET;
    const res = await POST(jsonRequest({ type: "video.asset.deleted", data: { id: "a1" } }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Webhook not configured" });
  });

  it("procesa sin verificar firma cuando no hay secreto fuera de producción", async () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.MUX_WEBHOOK_SECRET;
    const res = await POST(jsonRequest({ type: "video.asset.deleted", data: { id: "a1" } }));
    expect(res.status).toBe(200);
    expect(console.warn).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // video.asset.ready
  // ---------------------------------------------------------------------

  describe("video.asset.ready", () => {
    // E2 de docs/specs/grabacion-nativa.md (D4 de ADR-0034). Antes de este
    // cambio el handler salía por un `if (!upload_id) return` y la repetición de
    // una grabación nativa —que nace de POST /video/v1/assets y por eso NO tiene
    // upload_id— quedaba "Procesando en Mux…" para siempre, sin un error en los
    // logs. Con el código viejo esta prueba falla.
    it("sin upload_id ubica la lección por mux_asset_id (grabación nativa)", async () => {
      const res = await POST(
        jsonRequest({
          type: "video.asset.ready",
          data: {
            id: "asset-nativo",
            playback_ids: [{ id: "pb-nativo", policy: "public" }],
            duration: 4211,
          },
        }),
      );

      expect(res.status).toBe(200);
      const updateCall = recordedCalls.find((c) => c.op === "update.eq" && c.table === "lessons");
      expect(updateCall?.col).toBe("mux_asset_id");
      expect(updateCall?.val).toBe("asset-nativo");
      expect(updateCall?.obj).toMatchObject({
        mux_playback_id: "pb-nativo",
        video_duration_seconds: 4211,
        mux_error: null,
      });
      // Y el aviso "grabación disponible" sale igual que en el camino manual.
      expect(mDispatchRecordingAvailableNotification).toHaveBeenCalledWith(
        expect.anything(),
        "lesson-1",
      );
    });

    it("responde 200 sin tocar la BD si el evento no trae ni upload_id ni asset id", async () => {
      const res = await POST(jsonRequest({ type: "video.asset.ready", data: {} }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
      expect(recordedCalls).toHaveLength(0);
    });

    it("reutiliza la miniatura ya elegida por IA (idempotencia en redelivery)", async () => {
      existingLessonResult = {
        data: { thumbnail_url: "https://image.mux.com/pb-1/thumbnail.webp?time=17" },
      };
      const res = await POST(
        jsonRequest({
          type: "video.asset.ready",
          data: {
            id: "asset-1",
            upload_id: "upload-1",
            playback_ids: [{ id: "pb-1", policy: "public" }],
            duration: 120,
          },
        }),
      );
      expect(res.status).toBe(200);
      expect(mPickSmartThumbnailTime).not.toHaveBeenCalled();
      const updateCall = recordedCalls.find((c) => c.op === "update.eq" && c.table === "lessons");
      expect(updateCall?.obj?.thumbnail_url).toBe(
        "https://image.mux.com/pb-1/thumbnail.webp?time=17",
      );
    });

    it("pide a la IA el mejor frame cuando no hay miniatura previa", async () => {
      mPickSmartThumbnailTime.mockResolvedValue(42);
      const res = await POST(
        jsonRequest({
          type: "video.asset.ready",
          data: {
            id: "asset-1",
            upload_id: "upload-1",
            playback_ids: [{ id: "pb-1", policy: "public" }],
            duration: 125.6,
          },
        }),
      );
      expect(res.status).toBe(200);
      expect(mPickSmartThumbnailTime).toHaveBeenCalledWith("pb-1", 126);
      const updateCall = recordedCalls.find((c) => c.op === "update.eq" && c.table === "lessons");
      expect(updateCall?.obj?.thumbnail_url).toBe(
        "https://image.mux.com/pb-1/thumbnail.webp?time=42",
      );
    });

    it("cae al frame default de Mux si la IA no elige ninguno", async () => {
      mPickSmartThumbnailTime.mockResolvedValue(null);
      const res = await POST(
        jsonRequest({
          type: "video.asset.ready",
          data: {
            id: "asset-1",
            upload_id: "upload-1",
            playback_ids: [{ id: "pb-1", policy: "public" }],
            duration: 100,
          },
        }),
      );
      expect(res.status).toBe(200);
      const updateCall = recordedCalls.find((c) => c.op === "update.eq" && c.table === "lessons");
      expect(updateCall?.obj?.thumbnail_url).toBe("https://image.mux.com/pb-1/thumbnail.webp");
    });

    it("deja thumbnail_url en null si no hay playback_ids", async () => {
      const res = await POST(
        jsonRequest({
          type: "video.asset.ready",
          data: { id: "asset-1", upload_id: "upload-1", duration: 100 },
        }),
      );
      expect(res.status).toBe(200);
      expect(mPickSmartThumbnailTime).not.toHaveBeenCalled();
      const updateCall = recordedCalls.find((c) => c.op === "update.eq" && c.table === "lessons");
      expect(updateCall?.obj?.thumbnail_url).toBeNull();
    });

    it("no llama a la IA si falta duration, y usa el frame default", async () => {
      const res = await POST(
        jsonRequest({
          type: "video.asset.ready",
          data: {
            id: "asset-1",
            upload_id: "upload-1",
            playback_ids: [{ id: "pb-1", policy: "public" }],
          },
        }),
      );
      expect(res.status).toBe(200);
      expect(mPickSmartThumbnailTime).not.toHaveBeenCalled();
      const updateCall = recordedCalls.find((c) => c.op === "update.eq" && c.table === "lessons");
      expect(updateCall?.obj?.video_duration_seconds).toBeNull();
      expect(updateCall?.obj?.thumbnail_url).toBe("https://image.mux.com/pb-1/thumbnail.webp");
    });

    it("responde 500 si falla el update en BD", async () => {
      updateReadyResult = { data: null, error: { message: "boom" } };
      const res = await POST(
        jsonRequest({
          type: "video.asset.ready",
          data: { id: "asset-1", upload_id: "upload-1" },
        }),
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "DB update failed" });
      expect(mDispatchCapacitacionFollowup).not.toHaveBeenCalled();
      expect(mDispatchRecordingAvailableNotification).not.toHaveBeenCalled();
    });

    it("no dispara notificaciones si el update no afectó ninguna lección", async () => {
      updateReadyResult = { data: [], error: null };
      const res = await POST(
        jsonRequest({
          type: "video.asset.ready",
          data: { id: "asset-1", upload_id: "upload-1" },
        }),
      );
      expect(res.status).toBe(200);
      expect(mDispatchCapacitacionFollowup).not.toHaveBeenCalled();
      expect(mDispatchRecordingAvailableNotification).not.toHaveBeenCalled();
    });

    it("dispara ambas notificaciones de grabación disponible cuando sí hay lección afectada", async () => {
      updateReadyResult = { data: [{ id: "lesson-99" }], error: null };
      const res = await POST(
        jsonRequest({
          type: "video.asset.ready",
          data: { id: "asset-1", upload_id: "upload-1" },
        }),
      );
      expect(res.status).toBe(200);
      expect(mDispatchCapacitacionFollowup).toHaveBeenCalledWith(expect.anything(), "lesson-99");
      expect(mDispatchRecordingAvailableNotification).toHaveBeenCalledWith(
        expect.anything(),
        "lesson-99",
      );
    });
  });

  // ---------------------------------------------------------------------
  // video.upload.errored / video.asset.errored
  // ---------------------------------------------------------------------

  describe("video.upload.errored / video.asset.errored", () => {
    it("registra el mensaje de error de Mux cuando viene en errors.messages", async () => {
      const res = await POST(
        jsonRequest({
          type: "video.upload.errored",
          data: { id: "upload-1", errors: { messages: ["archivo corrupto", "timeout"] } },
        }),
      );
      expect(res.status).toBe(200);
      const call = recordedCalls.find((c) => c.op === "update.eq");
      expect(call?.col).toBe("mux_upload_id");
      expect(call?.val).toBe("upload-1");
      expect(call?.obj?.mux_error).toBe("archivo corrupto · timeout");
    });

    it("usa el mensaje default de upload.errored si no vienen errors", async () => {
      const res = await POST(
        jsonRequest({ type: "video.upload.errored", data: { id: "upload-1" } }),
      );
      expect(res.status).toBe(200);
      const call = recordedCalls.find((c) => c.op === "update.eq");
      expect(call?.obj?.mux_error).toBe("La subida del video falló en Mux.");
    });

    it("usa el mensaje default de asset.errored y filtra por upload_id si viene", async () => {
      const res = await POST(
        jsonRequest({
          type: "video.asset.errored",
          data: { id: "asset-1", upload_id: "upload-2" },
        }),
      );
      expect(res.status).toBe(200);
      const call = recordedCalls.find((c) => c.op === "update.eq");
      expect(call?.col).toBe("mux_upload_id");
      expect(call?.val).toBe("upload-2");
      expect(call?.obj?.mux_error).toBe("Mux no pudo procesar el video.");
    });

    it("filtra por mux_asset_id cuando asset.errored no trae upload_id", async () => {
      const res = await POST(
        jsonRequest({ type: "video.asset.errored", data: { id: "asset-1" } }),
      );
      expect(res.status).toBe(200);
      const call = recordedCalls.find((c) => c.op === "update.eq");
      expect(call?.col).toBe("mux_asset_id");
      expect(call?.val).toBe("asset-1");
    });
  });

  // ---------------------------------------------------------------------
  // video.asset.deleted
  // ---------------------------------------------------------------------

  it("video.asset.deleted limpia todos los campos de Mux de la lección", async () => {
    const res = await POST(
      jsonRequest({ type: "video.asset.deleted", data: { id: "asset-1" } }),
    );
    expect(res.status).toBe(200);
    const call = recordedCalls.find((c) => c.op === "update.eq");
    expect(call?.col).toBe("mux_asset_id");
    expect(call?.val).toBe("asset-1");
    expect(call?.obj).toEqual({
      mux_asset_id: null,
      mux_playback_id: null,
      mux_upload_id: null,
      video_duration_seconds: null,
      thumbnail_url: null,
    });
  });

  // ---------------------------------------------------------------------
  // video.asset.track.ready (subtítulos + pipeline de IA)
  // ---------------------------------------------------------------------

  describe("video.asset.track.ready", () => {
    it("ignora tracks que no son subtítulos", async () => {
      const res = await POST(
        jsonRequest({
          type: "video.asset.track.ready",
          data: { id: "track-1", asset_id: "asset-1", text_type: "captions" },
        }),
      );
      expect(res.status).toBe(200);
      expect(recordedCalls).toHaveLength(0);
    });

    it("ignora subtítulos sin asset_id", async () => {
      const res = await POST(
        jsonRequest({
          type: "video.asset.track.ready",
          data: { id: "track-1", text_type: "subtitles" },
        }),
      );
      expect(res.status).toBe(200);
      expect(recordedCalls).toHaveLength(0);
    });

    it("registra el error y no hace nada más si no encuentra la lección", async () => {
      trackReadyLessonResult = { data: null };
      const res = await POST(
        jsonRequest({
          type: "video.asset.track.ready",
          data: { id: "track-1", asset_id: "asset-x", text_type: "subtitles" },
        }),
      );
      expect(res.status).toBe(200);
      expect(console.error).toHaveBeenCalled();
      const updateCalls = recordedCalls.filter((c) => c.op === "update.eq");
      expect(updateCalls).toHaveLength(0);
    });

    it("responde 500 si falla al guardar el mux_track_id", async () => {
      trackUpdateResult = { data: null, error: { message: "boom" } };
      const res = await POST(
        jsonRequest({
          type: "video.asset.track.ready",
          data: { id: "track-1", asset_id: "asset-1", text_type: "subtitles" },
        }),
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "DB update failed" });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("sin mux_playback_id en la lección, no llama a fetch y guarda contenido null", async () => {
      trackReadyLessonResult = { data: { id: "lesson-1", mux_playback_id: null } };
      const res = await POST(
        jsonRequest({
          type: "video.asset.track.ready",
          data: { id: "track-1", asset_id: "asset-1", text_type: "subtitles" },
        }),
      );
      expect(res.status).toBe(200);
      expect(fetch).not.toHaveBeenCalled();
      const upsertCall = recordedCalls.find((c) => c.op === "upsert");
      expect(upsertCall?.obj?.content_text).toBeNull();
      expect(upsertCall?.obj?.content_vtt).toBeNull();
      expect(mCorrectTranscript).not.toHaveBeenCalled();
      expect(mGenerateLessonSummary).not.toHaveBeenCalled();
      expect(mGenerateLessonChapters).not.toHaveBeenCalled();
    });

    it("con txt y vtt disponibles, dispara corrección + resumen + capítulos", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.endsWith(".txt")) return { ok: true, text: async () => "texto plano" };
          if (url.endsWith(".vtt")) return { ok: true, text: async () => "WEBVTT\n..." };
          throw new Error("url inesperada " + url);
        }),
      );
      mCorrectTranscript.mockResolvedValue(undefined as never);
      mGenerateLessonSummary.mockResolvedValue(undefined as never);
      mGenerateLessonChapters.mockResolvedValue(undefined as never);

      const res = await POST(
        jsonRequest({
          type: "video.asset.track.ready",
          data: {
            id: "track-1",
            asset_id: "asset-1",
            text_type: "subtitles",
            language_code: "en",
          },
        }),
      );
      expect(res.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(2);
      const upsertCall = recordedCalls.find((c) => c.op === "upsert");
      expect(upsertCall?.obj?.content_text).toBe("texto plano");
      expect(upsertCall?.obj?.content_vtt).toBe("WEBVTT\n...");
      expect(upsertCall?.obj?.language).toBe("en");
      expect(mCorrectTranscript).toHaveBeenCalledWith("lesson-1");
      expect(mGenerateLessonSummary).toHaveBeenCalledWith("lesson-1");
      expect(mGenerateLessonChapters).toHaveBeenCalledWith("lesson-1");
    });

    it("usa 'es' como idioma default cuando no viene language_code", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: false, text: async () => "" })),
      );
      const res = await POST(
        jsonRequest({
          type: "video.asset.track.ready",
          data: { id: "track-1", asset_id: "asset-1", text_type: "subtitles" },
        }),
      );
      expect(res.status).toBe(200);
      const upsertCall = recordedCalls.find((c) => c.op === "upsert");
      expect(upsertCall?.obj?.language).toBe("es");
    });

    it("si solo el txt responde ok, solo dispara resumen y capítulos (no corrección)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.endsWith(".txt")) return { ok: true, text: async () => "texto" };
          return { ok: false, text: async () => "" };
        }),
      );
      const res = await POST(
        jsonRequest({
          type: "video.asset.track.ready",
          data: { id: "track-1", asset_id: "asset-1", text_type: "subtitles" },
        }),
      );
      expect(res.status).toBe(200);
      expect(mCorrectTranscript).not.toHaveBeenCalled();
      expect(mGenerateLessonSummary).toHaveBeenCalledWith("lesson-1");
      expect(mGenerateLessonChapters).toHaveBeenCalledWith("lesson-1");
    });

    it("si solo el vtt responde ok, solo dispara corrección (no resumen ni capítulos)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.endsWith(".vtt")) return { ok: true, text: async () => "WEBVTT" };
          return { ok: false, text: async () => "" };
        }),
      );
      const res = await POST(
        jsonRequest({
          type: "video.asset.track.ready",
          data: { id: "track-1", asset_id: "asset-1", text_type: "subtitles" },
        }),
      );
      expect(res.status).toBe(200);
      expect(mCorrectTranscript).toHaveBeenCalledWith("lesson-1");
      expect(mGenerateLessonSummary).not.toHaveBeenCalled();
      expect(mGenerateLessonChapters).not.toHaveBeenCalled();
    });

    it("responde 500 si falla el upsert de la transcripción", async () => {
      transcriptUpsertResult = { data: null, error: { message: "boom" } };
      const res = await POST(
        jsonRequest({
          type: "video.asset.track.ready",
          data: { id: "track-1", asset_id: "asset-1", text_type: "subtitles" },
        }),
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "DB update failed" });
      expect(mCorrectTranscript).not.toHaveBeenCalled();
    });

    it("no rompe el webhook si el pipeline de IA falla (allSettled absorbe el rechazo)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.endsWith(".txt")) return { ok: true, text: async () => "texto" };
          if (url.endsWith(".vtt")) return { ok: true, text: async () => "WEBVTT" };
          throw new Error("url inesperada " + url);
        }),
      );
      mCorrectTranscript.mockRejectedValue(new Error("IA caída"));
      mGenerateLessonSummary.mockRejectedValue(new Error("IA caída"));
      mGenerateLessonChapters.mockResolvedValue(undefined as never);

      const res = await POST(
        jsonRequest({
          type: "video.asset.track.ready",
          data: { id: "track-1", asset_id: "asset-1", text_type: "subtitles" },
        }),
      );
      expect(res.status).toBe(200);
      expect(console.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // Tipos de evento no manejados
  // ---------------------------------------------------------------------

  it("responde 200 sin efectos para un tipo de evento no manejado", async () => {
    const res = await POST(
      jsonRequest({ type: "video.live_stream.idle", data: { id: "x1" } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(recordedCalls).toHaveLength(0);
  });
});
