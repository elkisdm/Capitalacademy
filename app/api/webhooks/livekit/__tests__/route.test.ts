import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash, createHmac } from "node:crypto";

/**
 * Webhook de LiveKit (E10 y E11 de la spec).
 *
 * Por acá entra lo que crea assets en Mux y cierra grabaciones. Dos garantías:
 * en producción no se procesa nada sin firma válida, y una reentrega no crea un
 * segundo asset.
 */

const mockIngest = vi.fn();

type Result = { data?: unknown; error?: unknown };

let state: {
  porEgress: Result;
  porSala: Result;
  cierre: Result;
};

let calls: Array<{ table: string; method: string; args: unknown[] }>;

function builder(table: string) {
  const propios: Array<{ method: string; args: unknown[] }> = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "update", "eq", "in"]) {
    b[m] = (...args: unknown[]) => {
      propios.push({ method: m, args });
      calls.push({ table, method: m, args });
      return b;
    };
  }
  const tiene = (m: string) => propios.some((c) => c.method === m);
  const eq0 = () => propios.find((c) => c.method === "eq")?.args[0];

  const resolve = (): Result => {
    if (tiene("update")) return tiene("select") ? state.cierre : { data: null, error: null };
    return eq0() === "egress_id" ? state.porEgress : state.porSala;
  };

  b.maybeSingle = () => Promise.resolve(resolve());
  b.single = () => Promise.resolve(resolve());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

vi.mock("@/lib/classroom/ingest-recording", () => ({
  ingestRecording: (...a: unknown[]) => mockIngest(...a),
}));

const { POST } = await import("@/app/api/webhooks/livekit/route");

const API_KEY = "APIkey";
const API_SECRET = "secreto-de-prueba";

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function firmar(rawBody: string): string {
  const ahora = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: API_KEY,
      exp: ahora + 300,
      sha256: createHash("sha256").update(rawBody, "utf8").digest("base64"),
    }),
  );
  const firma = b64url(createHmac("sha256", API_SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${firma}`;
}

function req(evento: unknown, opts?: { authorization?: string | null }): Request {
  const raw = JSON.stringify(evento);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const auth = opts && "authorization" in opts ? opts.authorization : firmar(raw);
  if (auth) headers.authorization = auth;
  return new Request("http://localhost/api/webhooks/livekit", {
    method: "POST",
    body: raw,
    headers,
  });
}

const FIN_OK = {
  event: "egress_ended",
  egressInfo: {
    egressId: "EG_1",
    roomName: "clase-ses-1",
    status: "EGRESS_COMPLETE",
    fileResults: [{ filename: "ses-1/rec-1.mp4", size: 3_500_000_000, duration: 9_000_000_000 }],
  },
};

/** Payload del último update a session_recordings. */
function ultimaEscritura() {
  return calls.filter((c) => c.method === "update").at(-1)?.args[0] as
    | Record<string, unknown>
    | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  process.env.LIVEKIT_URL = "wss://livekit.example";
  process.env.LIVEKIT_API_KEY = API_KEY;
  process.env.LIVEKIT_API_SECRET = API_SECRET;
  vi.stubEnv("NODE_ENV", "production");

  state = {
    porEgress: { data: { id: "rec-1", session_id: "ses-1", status: "active", storage_path: null } },
    porSala: { data: null },
    cierre: { data: { id: "rec-1" } },
  };
  mockIngest.mockResolvedValue({ ok: true, estado: "ingesting" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/livekit", () => {
  it("cierra la fila con los datos del archivo y dispara la ingesta", async () => {
    const res = await POST(req(FIN_OK));

    expect(res.status).toBe(200);
    expect(ultimaEscritura()).toMatchObject({
      status: "uploaded",
      storage_path: "ses-1/rec-1.mp4",
      file_size_bytes: 3_500_000_000,
      // LiveKit reporta la duración en NANOSEGUNDOS: 9e9 ns son 9 s… de una
      // clase de 2,5 h serían 9000 s. Convertir mal deja registrada una clase de
      // 9 mil millones de segundos.
      duration_seconds: 9,
    });
    expect(mockIngest).toHaveBeenCalledWith(expect.anything(), "rec-1");
  });

  it("E10 — una reentrega no crea un segundo asset", async () => {
    // El update condicional no encuentra la fila abierta: ya se cerró antes.
    state.cierre = { data: null };

    const res = await POST(req(FIN_OK));

    expect(res.status).toBe(200);
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it("E11 — en producción, sin cabecera, 401 y nada se escribe", async () => {
    const res = await POST(req(FIN_OK, { authorization: null }));

    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it("E11 — en producción, con firma adulterada, 401", async () => {
    const raw = JSON.stringify(FIN_OK);
    const token = `${firmar(raw).slice(0, -4)}xxxx`;

    const res = await POST(req(FIN_OK, { authorization: token }));

    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("E11 — un token válido con OTRO cuerpo también se rechaza", async () => {
    const tokenDeOtroCuerpo = firmar(JSON.stringify({ event: "egress_ended" }));

    const res = await POST(req(FIN_OK, { authorization: tokenDeOtroCuerpo }));

    expect(res.status).toBe(401);
  });

  it("sin credenciales de LiveKit responde 500 y no procesa (fail-closed)", async () => {
    delete process.env.LIVEKIT_API_SECRET;

    const res = await POST(req(FIN_OK));

    expect(res.status).toBe(500);
    expect(calls).toHaveLength(0);
  });

  it("egress_started marca la fila como activa", async () => {
    const res = await POST(
      req({
        event: "egress_started",
        egressInfo: { egressId: "EG_1", roomName: "clase-ses-1", status: "EGRESS_ACTIVE" },
      }),
    );

    expect(res.status).toBe(200);
    expect(ultimaEscritura()).toMatchObject({ status: "active", egress_id: "EG_1" });
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it("un final con error deja el motivo en la fila y no ingesta nada", async () => {
    const res = await POST(
      req({
        event: "egress_ended",
        egressInfo: {
          egressId: "EG_1",
          roomName: "clase-ses-1",
          status: "EGRESS_FAILED",
          error: "chrome crashed",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(ultimaEscritura()).toMatchObject({ status: "failed", error: "chrome crashed" });
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it("los eventos que no son de egress se responden 200 sin hacer nada", async () => {
    // `room_started`, `participant_joined` y compañía llegan por la misma URL.
    // Convertirlos en error haría que LiveKit reintentara para siempre algo que
    // nunca nos importó.
    const res = await POST(req({ event: "participant_joined", participant: { identity: "u1" } }));

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("ubica la fila por la sala cuando el egress_id no quedó guardado", async () => {
    state.porEgress = { data: null };
    state.porSala = {
      data: { id: "rec-9", session_id: "ses-1", status: "starting", storage_path: null },
    };

    const res = await POST(req(FIN_OK));

    expect(res.status).toBe(200);
    expect(mockIngest).toHaveBeenCalledWith(expect.anything(), "rec-9");
  });

  it("un evento sin fila conocida responde 200 (grabación que no registramos)", async () => {
    state.porEgress = { data: null };
    state.porSala = { data: null };

    const res = await POST(req(FIN_OK));

    expect(res.status).toBe(200);
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it("acepta el evento con los nombres del proto", async () => {
    const res = await POST(
      req({
        event: "egress_ended",
        egress_info: {
          egress_id: "EG_1",
          room_name: "clase-ses-1",
          status: "EGRESS_COMPLETE",
          file_results: [{ filename: "ses-1/rec-1.mp4", size: "10", duration: "120" }],
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(ultimaEscritura()).toMatchObject({ file_size_bytes: 10, duration_seconds: 120 });
  });
});
