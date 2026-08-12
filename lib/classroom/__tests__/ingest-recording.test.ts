import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Ingesta a Mux del archivo que dejó Egress (E8 y E9 de la spec).
 *
 * Es el punto donde el camino nativo se junta con el manual. Dos cosas no
 * pueden fallar: no pisar una repetición que ya existe, y no crear dos assets
 * por el mismo archivo cuando LiveKit reentrega el webhook.
 */

type Result = { data?: unknown; error?: unknown };

let state: {
  fila: Result;
  reserva: Result;
  session: Result;
  lesson: Result;
  signed: { data?: { signedUrl: string } | null; error?: unknown };
};

let calls: Array<{ table: string; method: string; args: unknown[] }>;
let ensureResult: unknown;
const assetsCreate = vi.fn();

vi.mock("@/lib/mux/client", () => ({
  getMuxClient: () => ({ video: { assets: { create: assetsCreate } } }),
}));

vi.mock("@/lib/classroom/ensure-recording-lesson", () => ({
  ensureRecordingLesson: vi.fn(async () => ensureResult),
}));

const createSignedUrl = vi.fn(async () => state.signed);

function builder(table: string) {
  const propios: Array<{ method: string; args: unknown[] }> = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "eq", "in", "is", "order", "limit"]) {
    b[m] = (...args: unknown[]) => {
      propios.push({ method: m, args });
      calls.push({ table, method: m, args });
      return b;
    };
  }
  const tiene = (m: string) => propios.some((c) => c.method === m);

  const resolve = (): Result => {
    if (table === "session_recordings") {
      if (!tiene("update")) return state.fila;
      // El update con `.select()` es la reserva atómica; el resto son escrituras.
      return tiene("select") ? state.reserva : { data: null, error: null };
    }
    if (table === "class_sessions") return state.session;
    if (table === "lessons") return tiene("update") ? { error: null } : state.lesson;
    return { data: null, error: null };
  };

  b.single = () => Promise.resolve(resolve());
  b.maybeSingle = () => Promise.resolve(resolve());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return b;
}

const admin = {
  from: (table: string) => builder(table),
  storage: { from: () => ({ createSignedUrl }) },
} as never;

const { ingestRecording } = await import("@/lib/classroom/ingest-recording");

/** Último payload escrito en session_recordings. */
function ultimaEscritura() {
  const escrituras = calls.filter((c) => c.table === "session_recordings" && c.method === "update");
  return escrituras.at(-1)?.args[0] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  ensureResult = { ok: true, lessonId: "lesson-1", created: true };
  state = {
    fila: {
      data: {
        id: "rec-1",
        session_id: "ses-1",
        status: "uploaded",
        storage_path: "ses-1/rec-1.mp4",
        mux_asset_id: null,
      },
    },
    reserva: { data: { id: "rec-1" } },
    session: { data: { id: "ses-1", module_id: "mod-1", lesson_id: null, title: "Clase 1" } },
    lesson: { data: { id: "lesson-1", mux_asset_id: null, mux_upload_id: null } },
    signed: { data: { signedUrl: "https://firmada.example/rec-1.mp4" }, error: null },
  };
  assetsCreate.mockResolvedValue({ id: "asset-nativo" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ingestRecording", () => {
  it("crea el asset con la MISMA configuración que la subida manual", async () => {
    const r = await ingestRecording(admin, "rec-1");

    expect(r).toEqual({
      ok: true,
      estado: "ingesting",
      muxAssetId: "asset-nativo",
      lessonId: "lesson-1",
    });

    expect(createSignedUrl).toHaveBeenCalledWith("ses-1/rec-1.mp4", 3_600);
    const params = assetsCreate.mock.calls[0][0];
    expect(params.inputs[0].url).toBe("https://firmada.example/rec-1.mp4");
    expect(params.inputs[0].generated_subtitles).toEqual([
      { language_code: "es", name: "Español CC" },
    ]);
    expect(params.video_quality).toBe("basic");
    expect(params.static_renditions).toEqual([{ resolution: "highest" }]);
    expect(params.playback_policies).toEqual(["public"]);

    // El asset se escribe en la LECCIÓN de inmediato: el webhook de Mux la
    // ubica por ahí (D4) y `video.asset.ready` puede llegar en segundos.
    const enLeccion = calls.find((c) => c.table === "lessons" && c.method === "update")!
      .args[0] as Record<string, unknown>;
    expect(enLeccion).toEqual({ mux_asset_id: "asset-nativo", mux_error: null });

    expect(ultimaEscritura()).toMatchObject({
      status: "ingesting",
      mux_asset_id: "asset-nativo",
    });
  });

  it("reserva la fila con un update condicional antes de tocar Mux (E10)", async () => {
    await ingestRecording(admin, "rec-1");

    const reserva = calls.filter(
      (c) => c.table === "session_recordings" && c.method === "update",
    )[0];
    // `ingested_at` se estampa AL RESERVAR: es el reloj con que el cron mide si
    // la ingesta está colgada — al final la gracia sería cero (mediría desde el
    // inicio de la grabación) y preemptaría ingestas en vuelo.
    expect(reserva.args[0]).toMatchObject({ status: "ingesting" });
    expect((reserva.args[0] as Record<string, unknown>).ingested_at).toBeTruthy();
    // El `.eq("status", "uploaded")` es lo que hace que una reentrega no cree un
    // segundo asset.
    const condiciones = calls.filter((c) => c.table === "session_recordings" && c.method === "eq");
    expect(condiciones.some((c) => c.args[0] === "status" && c.args[1] === "uploaded")).toBe(true);
  });

  it("si otra corrida ya la tomó, no crea un segundo asset (E10)", async () => {
    state.reserva = { data: null };

    const r = await ingestRecording(admin, "rec-1");

    expect(r.ok).toBe(false);
    expect(assetsCreate).not.toHaveBeenCalled();
  });

  it("NO pisa una repetición que ya tiene video: cierra la fila en failed (E8)", async () => {
    state.lesson = { data: { id: "lesson-1", mux_asset_id: "asset-viejo", mux_upload_id: null } };

    const r = await ingestRecording(admin, "rec-1");

    expect(r).toMatchObject({ ok: false, estado: "failed" });
    expect(assetsCreate).not.toHaveBeenCalled();
    // `failed` es terminal: si volviera a `uploaded`, la reconciliación la
    // reintentaría por siempre y el MP4 jamás saldría del bucket. El archivo
    // se conserva la ventana de retención por si el equipo decide reemplazar.
    expect(ultimaEscritura()).toMatchObject({ status: "failed" });
  });

  it("tampoco pisa una subida manual todavía en curso", async () => {
    state.lesson = { data: { id: "lesson-1", mux_asset_id: null, mux_upload_id: "upload-1" } };

    const r = await ingestRecording(admin, "rec-1");

    expect(r.ok).toBe(false);
    expect(assetsCreate).not.toHaveBeenCalled();
  });

  it("sesión sin módulo: falla con un motivo accionable y conserva el archivo (E9)", async () => {
    ensureResult = { ok: false, reason: "module_missing" };

    const r = await ingestRecording(admin, "rec-1");

    expect(r).toMatchObject({ ok: false, estado: "failed" });
    expect(r.ok === false && r.motivo).toBe(
      "Asigna un módulo a la sesión para publicar la repetición.",
    );
    expect(ultimaEscritura()).toMatchObject({
      status: "failed",
      error: "Asigna un módulo a la sesión para publicar la repetición.",
    });
    // Nada de borrar el objeto: hay 14 días para asignar el módulo y reintentar.
    expect(calls.some((c) => c.method === "delete")).toBe(false);
  });

  it("una URL firmada que no se puede emitir deja la fila fallida", async () => {
    state.signed = { data: null, error: { message: "no such object" } };

    const r = await ingestRecording(admin, "rec-1");

    expect(r).toMatchObject({ ok: false, estado: "failed" });
    expect(assetsCreate).not.toHaveBeenCalled();
  });

  it("un 4xx de Mux deja la fila fallida y conserva el archivo para reintentar", async () => {
    assetsCreate.mockRejectedValue(new Error("400 invalid input"));

    const r = await ingestRecording(admin, "rec-1");

    expect(r).toMatchObject({ ok: false, estado: "failed" });
    expect(ultimaEscritura()).toMatchObject({
      status: "failed",
      error: "Mux rechazó la grabación. El archivo se conserva para reintentar.",
    });
  });

  it("sin archivo en el bucket no hay nada que ingestar", async () => {
    state.fila = {
      data: {
        id: "rec-1",
        session_id: "ses-1",
        status: "uploaded",
        storage_path: null,
        mux_asset_id: null,
      },
    };

    const r = await ingestRecording(admin, "rec-1");

    expect(r).toMatchObject({ ok: false, estado: "failed" });
    expect(assetsCreate).not.toHaveBeenCalled();
  });

  it("una fila que no existe no explota", async () => {
    state.fila = { data: null };
    const r = await ingestRecording(admin, "rec-1");
    expect(r).toMatchObject({ ok: false, estado: null });
  });

  it("el playback es público SIEMPRE: firmar solo este camino rompería el player", async () => {
    // La decisión vigente de todo el producto es playback sin firmar; el player
    // no firma URLs. Este test protege contra reintroducir un condicional que
    // deje la política a merced de una variable de entorno.
    vi.stubEnv("MUX_SIGNING_KEY_ID", "clave-1");
    await ingestRecording(admin, "rec-1");
    expect(assetsCreate.mock.calls[0][0].playback_policies).toEqual(["public"]);
    vi.unstubAllEnvs();
  });
});
