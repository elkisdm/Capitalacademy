import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Cron de reconciliación y limpieza (E6 y la limpieza de D7).
 *
 * El camino feliz lo mueven los webhooks; esto existe para los días en que uno
 * no llega. Sin esto: un archivo grabado que nadie ingesta, un Chrome de Egress
 * facturando de noche, y un MP4 con caras de alumnos que se queda para siempre.
 */

const listEgress = vi.fn();
const stopEgress = vi.fn();
const ingestRecording = vi.fn();
const assetsRetrieve = vi.fn();
const storageRemove = vi.fn();

vi.mock("@/lib/livekit/egress", () => ({
  GRABACIONES_BUCKET: "grabaciones",
  listEgress: (...a: unknown[]) => listEgress(...a),
  stopEgress: (...a: unknown[]) => stopEgress(...a),
}));

vi.mock("@/lib/classroom/ingest-recording", () => ({
  ingestRecording: (...a: unknown[]) => ingestRecording(...a),
}));

vi.mock("@/lib/mux/client", () => ({
  getMuxClient: () => ({ video: { assets: { retrieve: assetsRetrieve } } }),
}));

type Result = { data?: unknown; error?: unknown };

let state: {
  cerradasSinIngesta?: unknown[];
  abiertas: unknown[];
  arrancando: unknown[];
  ingestando: unknown[];
  listas: unknown[];
  vencidas: unknown[];
  cierre: Result;
  sesion: Result;
};

let calls: Array<{ table: string; method: string; args: unknown[] }>;

function builder(table: string) {
  const propios: Array<{ method: string; args: unknown[] }> = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "update", "eq", "in", "is", "not", "lt", "or", "limit", "order"]) {
    b[m] = (...args: unknown[]) => {
      propios.push({ method: m, args });
      calls.push({ table, method: m, args });
      return b;
    };
  }
  const tiene = (m: string) => propios.some((c) => c.method === m);
  const estadoPedido = () =>
    propios.find((c) => c.method === "eq" && c.args[0] === "status")?.args[1];

  const resolve = (): Result => {
    if (table === "class_sessions") return state.sesion;
    if (table === "lessons") return { data: null, error: null };
    if (tiene("update")) return tiene("select") ? state.cierre : { data: null, error: null };
    if (tiene("in")) return { data: state.abiertas, error: null };
    switch (estadoPedido()) {
      case "uploaded":
        return { data: state.cerradasSinIngesta ?? [], error: null };
      case "starting":
        return { data: state.arrancando, error: null };
      case "ingesting":
        return { data: state.ingestando, error: null };
      case "ready":
        return { data: state.listas, error: null };
      case "failed":
        return { data: state.vencidas, error: null };
      default:
        return { data: [], error: null };
    }
  };

  b.maybeSingle = () => Promise.resolve(resolve());
  b.single = () => Promise.resolve(resolve());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return b;
}

const mFollowup = vi.fn(async () => {});
const mAviso = vi.fn(async () => {});
vi.mock("@/lib/classroom/recording-notifications", () => ({
  dispatchCapacitacionFollowup: mFollowup,
  dispatchRecordingAvailableNotification: mAviso,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => builder(table),
    storage: { from: () => ({ remove: storageRemove }) },
  }),
}));

const { GET } = await import("@/app/api/cron/grabaciones/route");

function req(secret: string | null = "cron-secreto") {
  return new Request("http://localhost/api/cron/grabaciones", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

/** Escrituras a session_recordings, en orden. */
function escrituras() {
  return calls
    .filter((c) => c.table === "session_recordings" && c.method === "update")
    .map((c) => c.args[0] as Record<string, unknown>);
}

const FILA_ABIERTA = {
  id: "rec-1",
  session_id: "ses-1",
  status: "active",
  egress_id: "EG_1",
  storage_path: null,
  mux_asset_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  process.env.CRON_SECRET = "cron-secreto";
  process.env.LIVEKIT_URL = "wss://livekit.example";
  process.env.LIVEKIT_API_KEY = "APIkey";
  process.env.LIVEKIT_API_SECRET = "secreto-de-prueba";

  state = {
    cerradasSinIngesta: [],
    abiertas: [],
    arrancando: [],
    ingestando: [],
    listas: [],
    vencidas: [],
    cierre: { data: { id: "rec-1" } },
    sesion: { data: { lesson_id: "lesson-1" } },
  };

  listEgress.mockResolvedValue([]);
  stopEgress.mockResolvedValue({});
  ingestRecording.mockResolvedValue({ ok: true, estado: "ingesting" });
  storageRemove.mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/cron/grabaciones", () => {
  it("401 sin el secreto del cron", async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("401 con un secreto equivocado", async () => {
    expect((await GET(req("otro-secreto"))).status).toBe(401);
  });

  it("E6 — aplica el cierre que se perdió y dispara la ingesta", async () => {
    state.abiertas = [FILA_ABIERTA];
    listEgress.mockResolvedValue([
      {
        egressId: "EG_1",
        status: "EGRESS_COMPLETE",
        fileResults: [{ filename: "ses-1/rec-1.mp4", size: 1234 }],
      },
    ]);

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, cerradas: 1, ingestadas: 1 });
    expect(escrituras()[0]).toMatchObject({
      status: "uploaded",
      storage_path: "ses-1/rec-1.mp4",
      file_size_bytes: 1234,
    });
    expect(ingestRecording).toHaveBeenCalledWith(expect.anything(), "rec-1");
  });

  it("E6 — un trabajo que sigue vivo con la clase terminada se corta", async () => {
    state.abiertas = [FILA_ABIERTA];
    listEgress.mockResolvedValue([{ egressId: "EG_1", status: "EGRESS_ACTIVE" }]);

    const res = await GET(req());

    expect((await res.json()).detenidas).toBe(1);
    expect(stopEgress).toHaveBeenCalledWith(
      expect.objectContaining({ room: "clase-ses-1", egressId: "EG_1" }),
    );
    expect(ingestRecording).not.toHaveBeenCalled();
  });

  it("una fila abierta sin ningún trabajo en LiveKit se cierra como fallida", async () => {
    state.abiertas = [FILA_ABIERTA];
    listEgress.mockResolvedValue([]);

    const res = await GET(req());

    expect((await res.json()).fallidas).toBe(1);
    expect(escrituras()[0]).toMatchObject({ status: "failed" });
    expect(String(escrituras()[0].error)).toMatch(/a mano/);
  });

  it("un final con error de Egress no dispara ninguna ingesta", async () => {
    state.abiertas = [FILA_ABIERTA];
    listEgress.mockResolvedValue([{ egressId: "EG_1", status: "EGRESS_FAILED", error: "sin CPU" }]);

    await GET(req());

    expect(escrituras()[0]).toMatchObject({ status: "failed", error: "sin CPU" });
    expect(ingestRecording).not.toHaveBeenCalled();
  });

  it("una fila atascada en starting se libera para poder reintentar", async () => {
    // Mientras siga `starting` ocupa el índice único parcial y el docente no
    // puede volver a pedir la grabación.
    state.arrancando = [{ ...FILA_ABIERTA, status: "starting", egress_id: null }];

    const res = await GET(req());

    expect((await res.json()).fallidas).toBe(1);
    expect(escrituras()[0]).toMatchObject({ status: "failed" });
  });

  it("si el trabajo sí había arrancado, la fila pasa a activa", async () => {
    state.arrancando = [{ ...FILA_ABIERTA, status: "starting", egress_id: null }];
    listEgress.mockResolvedValue([{ egressId: "EG_7", status: "EGRESS_ACTIVE" }]);

    await GET(req());

    expect(escrituras()[0]).toMatchObject({ status: "active", egress_id: "EG_7" });
  });

  it("una ingesta confirmada por Mux marca la fila lista", async () => {
    state.ingestando = [{ ...FILA_ABIERTA, status: "ingesting", mux_asset_id: "asset-1" }];
    assetsRetrieve.mockResolvedValue({
      status: "ready",
      duration: 4211.4,
      playback_ids: [{ id: "pb-1" }],
    });

    const res = await GET(req());

    expect((await res.json()).listas).toBe(1);
    expect(escrituras().at(-1)).toMatchObject({ status: "ready", duration_seconds: 4211 });
    // Red de seguridad de la carrera de D4: si el webhook de Mux llegó antes de
    // que escribiéramos el asset, la lección se completa acá.
    const enLeccion = calls.find((c) => c.table === "lessons" && c.method === "update")!
      .args[0] as Record<string, unknown>;
    expect(enLeccion).toMatchObject({ mux_playback_id: "pb-1", mux_asset_id: "asset-1" });
  });

  it("un asset que Mux no pudo procesar deja la fila fallida", async () => {
    state.ingestando = [{ ...FILA_ABIERTA, status: "ingesting", mux_asset_id: "asset-1" }];
    assetsRetrieve.mockResolvedValue({ status: "errored" });

    const res = await GET(req());

    expect((await res.json()).fallidas).toBe(1);
    expect(escrituras().at(-1)).toMatchObject({ status: "failed" });
  });

  it("un asset todavía procesándose se deja para la próxima corrida", async () => {
    state.ingestando = [{ ...FILA_ABIERTA, status: "ingesting", mux_asset_id: "asset-1" }];
    assetsRetrieve.mockResolvedValue({ status: "preparing" });

    const res = await GET(req());

    expect(await res.json()).toMatchObject({ listas: 0, fallidas: 0 });
    expect(escrituras()).toHaveLength(0);
  });

  it("una fila reservada que nunca llegó a crear el asset se reintenta", async () => {
    state.ingestando = [{ ...FILA_ABIERTA, status: "ingesting", mux_asset_id: null }];

    const res = await GET(req());

    expect((await res.json()).ingestadas).toBe(1);
    expect(escrituras()[0]).toMatchObject({ status: "uploaded" });
    expect(ingestRecording).toHaveBeenCalledWith(expect.anything(), "rec-1");
  });

  it("D7 — borra el archivo apenas la repetición queda publicada", async () => {
    state.listas = [{ ...FILA_ABIERTA, status: "ready", storage_path: "ses-1/rec-1.mp4" }];

    const res = await GET(req());

    expect((await res.json()).borradas).toBe(1);
    expect(storageRemove).toHaveBeenCalledWith(["ses-1/rec-1.mp4"]);
    expect(escrituras().at(-1)).toHaveProperty("storage_deleted_at");
  });

  it("D7 — barre también las fallidas que pasaron la retención", async () => {
    state.vencidas = [{ ...FILA_ABIERTA, status: "failed", storage_path: "ses-1/vieja.mp4" }];

    await GET(req());

    expect(storageRemove).toHaveBeenCalledWith(["ses-1/vieja.mp4"]);
  });

  it("si el borrado del objeto falla, la fila NO se marca como borrada", async () => {
    state.listas = [{ ...FILA_ABIERTA, status: "ready", storage_path: "ses-1/rec-1.mp4" }];
    storageRemove.mockResolvedValue({ error: { message: "boom" } });

    const res = await GET(req());

    expect((await res.json()).borradas).toBe(0);
    expect(escrituras()).toHaveLength(0);
  });

  it("respeta el techo de filas por corrida", async () => {
    await GET(req());
    const limites = calls.filter((c) => c.method === "limit").map((c) => c.args[0]);
    expect(limites.length).toBeGreaterThan(0);
    expect(limites.every((l) => l === 10)).toBe(true);
  });

  it("sin credenciales de LiveKit igual corre la limpieza que protege datos", async () => {
    delete process.env.LIVEKIT_API_SECRET;
    state.abiertas = [FILA_ABIERTA];
    state.listas = [{ ...FILA_ABIERTA, status: "ready", storage_path: "ses-1/rec-1.mp4" }];

    const res = await GET(req());

    expect(listEgress).not.toHaveBeenCalled();
    expect((await res.json()).borradas).toBe(1);
  });
  it("1b — una fila cerrada (`uploaded` + ended_at) con archivo se rescata e ingesta", async () => {
    // Es lo que deja el "Detener" del docente cuando el `egress_ended` se
    // pierde: ninguna otra rama la mira, y sin esto el MP4 con PII queda en el
    // bucket para siempre y la clase sin repetición.
    state.cerradasSinIngesta = [
      { ...FILA_ABIERTA, status: "uploaded", storage_path: "ses-1/rec-1.mp4" },
    ];

    await GET(req());

    expect(ingestRecording).toHaveBeenCalledWith(expect.anything(), "rec-1");
  });

  it("1b — cerrada SIN archivo y sin trabajo en LiveKit se marca fallida", async () => {
    state.cerradasSinIngesta = [{ ...FILA_ABIERTA, status: "uploaded", storage_path: null }];
    listEgress.mockResolvedValue([]);

    await GET(req());

    expect(ingestRecording).not.toHaveBeenCalled();
    const fallo = escrituras().find((e) => e.status === "failed");
    expect(fallo?.error).toContain("no dejó ningún archivo");
  });

});
