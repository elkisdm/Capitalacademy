import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Grabación nativa de la clase (E3, E4, E5 y E12 de la spec).
 *
 * Es una frontera de permisos y de plata: quien no dicta la clase no puede
 * grabarla, y un arranque duplicado levanta dos Chrome que pelean por la misma
 * lección.
 */

const mockGetUser = vi.fn();
const mockAccess = vi.fn();
const fetchMock = vi.fn();

type Result = { data?: unknown; error?: unknown };

let state: {
  session: Result;
  viva: Result;
  ultima: Result;
  insert: Result;
  update: Result;
};

let calls: Array<{ table: string; method: string; args: unknown[] }>;

function builder(table: string) {
  const propios: Array<{ method: string; args: unknown[] }> = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "eq", "in", "order", "limit"]) {
    b[m] = (...args: unknown[]) => {
      propios.push({ method: m, args });
      calls.push({ table, method: m, args });
      return b;
    };
  }
  const tiene = (m: string) => propios.some((c) => c.method === m);

  const resolve = (): Result => {
    if (table === "class_sessions") return state.session;
    if (tiene("insert")) return state.insert;
    if (tiene("update")) return state.update;
    if (tiene("in")) return state.viva;
    return state.ultima;
  };

  b.single = () => Promise.resolve(resolve());
  b.maybeSingle = () => Promise.resolve(resolve());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

vi.mock("@/lib/classroom/access", () => ({
  getClassroomAccess: (...a: unknown[]) => mockAccess(...a),
}));

const { GET, POST, DELETE } = await import("@/app/api/classroom/clase/[sessionId]/grabacion/route");

const CODIGO = "xkw-mqtd-abn";
let usuarios = 0;
let userId = "u1";

function ctx(sessionId = CODIGO) {
  return [
    new Request(`http://localhost/api/classroom/clase/${sessionId}/grabacion`, { method: "POST" }),
    { params: Promise.resolve({ sessionId }) },
  ] as const;
}

/** Endpoints twirp llamados, en orden. */
function endpoints() {
  return fetchMock.mock.calls.map((c) => String(c[0]).split("/").pop());
}

const FILA_VIVA = {
  id: "rec-1",
  status: "active",
  egress_id: "EG_1",
  started_at: "2026-08-12T18:02:11.000Z",
  ended_at: null,
  duration_seconds: null,
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  userId = `u${++usuarios}`;

  process.env.LIVEKIT_URL = "wss://livekit.example";
  process.env.LIVEKIT_API_KEY = "APIkey";
  process.env.LIVEKIT_API_SECRET = "secreto-de-prueba";
  process.env.LIVEKIT_EGRESS_ENABLED = "true";
  process.env.SUPABASE_S3_ACCESS_KEY_ID = "AKIA";
  process.env.SUPABASE_S3_SECRET_ACCESS_KEY = "shh";
  process.env.SUPABASE_S3_REGION = "us-east-2";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto.supabase.co";

  mockGetUser.mockResolvedValue({ data: { user: { id: userId } } });
  // Docente por defecto.
  mockAccess.mockResolvedValue({ enrollment: null, isStaff: true });

  state = {
    session: {
      data: {
        id: "ses-uuid",
        cohort_id: "cohorte-1",
        starts_at: "2026-08-12T17:00:00Z",
        ends_at: "2026-08-12T19:00:00Z",
        modality: "live_online",
        lesson_id: null,
      },
    },
    viva: { data: null },
    ultima: { data: null },
    insert: { data: { ...FILA_VIVA, status: "starting", egress_id: null } },
    update: { data: { ...FILA_VIVA } },
  };

  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ egressId: "EG_1", status: "EGRESS_STARTING" }),
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/classroom/clase/[sessionId]/grabacion", () => {
  it("arranca la grabación y guarda el trabajo en la fila", async () => {
    const res = await POST(...ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ grabando: true, egressId: "EG_1" });
    expect(endpoints()).toEqual(["StartRoomCompositeEgress"]);

    // La fila se crea ANTES de llamar a Egress: es la reserva que hace valer el
    // índice único parcial.
    const insert = calls.find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({
      session_id: "ses-uuid",
      status: "starting",
      started_by: userId,
    });

    const cuerpo = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(cuerpo.room_name).toBe("clase-ses-uuid");
    expect(cuerpo.file_outputs[0].filepath).toBe("ses-uuid/rec-1.mp4");

    const update = calls.find((c) => c.table === "session_recordings" && c.method === "update")!
      .args[0] as Record<string, unknown>;
    expect(update).toMatchObject({ egress_id: "EG_1", storage_path: "ses-uuid/rec-1.mp4" });
  });

  it("E3 — con una grabación en curso responde el estado y NO arranca otra", async () => {
    state.viva = { data: FILA_VIVA };

    const res = await POST(...ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ grabando: true, yaEstaba: true, estado: "active" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("E3 — si dos llamadas corren juntas, el índice único deja pasar una sola", async () => {
    // La perdedora recibe 23505 del insert y devuelve el estado de la ganadora.
    state.insert = { data: null, error: { code: "23505" } };
    let primera = true;
    Object.defineProperty(state, "viva", {
      get() {
        if (primera) {
          primera = false;
          return { data: null };
        }
        return { data: FILA_VIVA };
      },
    });

    const res = await POST(...ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ yaEstaba: true, grabando: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("E12 — con el interruptor apagado la sala funciona y no se graba nada", async () => {
    process.env.LIVEKIT_EGRESS_ENABLED = "false";

    const res = await POST(...ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ grabando: false, estado: null, deshabilitado: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("503 nombrando las variables que faltan", async () => {
    delete process.env.SUPABASE_S3_ACCESS_KEY_ID;
    delete process.env.LIVEKIT_API_SECRET;

    const res = await POST(...ctx());

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.missing).toContain("SUPABASE_S3_ACCESS_KEY_ID");
    expect(json.missing).toContain("LIVEKIT_API_SECRET");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("409 cuando todavía no hay nadie en la sala", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ code: "not_found", msg: "room not found" }),
    });

    const res = await POST(...ctx());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Entra a la sala/);
  });

  it("E5 — Egress caído: 502, fila fallida con el motivo y la clase sigue", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => "no CPU available" });

    const res = await POST(...ctx());

    expect(res.status).toBe(502);
    const update = calls.find((c) => c.table === "session_recordings" && c.method === "update")!
      .args[0] as Record<string, unknown>;
    expect(update.status).toBe("failed");
    expect(String(update.error)).toContain("no CPU available");
  });

  it("E4 — un alumno matriculado no puede grabar", async () => {
    mockAccess.mockResolvedValue({ enrollment: { id: "e1" }, isStaff: false });

    const res = await POST(...ctx());

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("E4 — un invitado aprobado en la sala de espera tampoco", async () => {
    // Entra a la sala como alumno (0091), pero grabar no es entrar.
    mockAccess.mockResolvedValue({ enrollment: null, isStaff: false });

    expect((await POST(...ctx())).status).toBe(403);
  });

  it("E4 — un docente de OTRA cohorte tampoco", async () => {
    mockAccess.mockResolvedValue(null);

    expect((await POST(...ctx())).status).toBe(403);
  });

  it("401 sin sesión y 404 si la referencia de la clase no es válida", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(...ctx())).status).toBe(401);

    mockGetUser.mockResolvedValue({ data: { user: { id: userId } } });
    expect((await POST(...ctx("../../etc/passwd"))).status).toBe(404);
  });

  it("404 cuando la clase no existe", async () => {
    state.session = { data: null };
    expect((await POST(...ctx())).status).toBe(404);
  });

  it("limita la tasa por usuario", async () => {
    let ultima = 200;
    for (let i = 0; i < 22; i++) ultima = (await POST(...ctx())).status;
    expect(ultima).toBe(429);
  });
});

describe("GET /api/classroom/clase/[sessionId]/grabacion", () => {
  it("devuelve el estado de la última grabación", async () => {
    state.ultima = {
      data: {
        ...FILA_VIVA,
        status: "ready",
        duration_seconds: 4211,
        ended_at: "2026-08-12T20:00:00Z",
      },
    };
    state.session = {
      data: { ...(state.session.data as object), lesson_id: "lesson-1" },
    };

    const res = await GET(...ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      grabando: false,
      estado: "ready",
      iniciadaEn: "2026-08-12T18:02:11.000Z",
      duracionSegundos: 4211,
      error: null,
      lessonId: "lesson-1",
    });
  });

  it("sin grabaciones responde el estado vacío, no un 404", async () => {
    const res = await GET(...ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ grabando: false, estado: null });
  });

  it("un alumno no puede ni consultar el estado", async () => {
    mockAccess.mockResolvedValue({ enrollment: { id: "e1" }, isStaff: false });
    expect((await GET(...ctx())).status).toBe(403);
  });
});

describe("DELETE /api/classroom/clase/[sessionId]/grabacion", () => {
  it("detiene el trabajo y deja la fila esperando el archivo", async () => {
    state.viva = { data: FILA_VIVA };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ egressId: "EG_1", status: "EGRESS_ENDING" }),
    });

    const res = await DELETE(...ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ grabando: false, estado: "uploaded" });
    expect(endpoints()).toEqual(["StopEgress"]);
    const update = calls.find((c) => c.table === "session_recordings" && c.method === "update")!
      .args[0] as Record<string, unknown>;
    expect(update.status).toBe("uploaded");
  });

  it("detener algo que no está grabando es el resultado que se pedía", async () => {
    const res = await DELETE(...ctx());

    expect(res.status).toBe(200);
    // Responde el estado REAL de la última fila: el doble-clic en "Detener" no
    // debe borrarle al panel el estado que ya tenía.
    expect(await res.json()).toMatchObject({ grabando: false, yaEstaba: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un trabajo que LiveKit ya no conoce se cierra igual", async () => {
    state.viva = { data: FILA_VIVA };
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ code: "not_found", msg: "egress does not exist" }),
    });

    expect((await DELETE(...ctx())).status).toBe(200);
  });

  it("si StopEgress falla de verdad, no se miente diciendo que se detuvo", async () => {
    state.viva = { data: FILA_VIVA };
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });

    const res = await DELETE(...ctx());

    expect(res.status).toBe(502);
    expect(calls.some((c) => c.table === "session_recordings" && c.method === "update")).toBe(
      false,
    );
  });

  it("una fila reservada que nunca arrancó se cierra sin llamar a LiveKit", async () => {
    state.viva = { data: { ...FILA_VIVA, egress_id: null, status: "starting" } };

    const res = await DELETE(...ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ grabando: false, estado: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("E4 — un alumno no puede detener la grabación", async () => {
    mockAccess.mockResolvedValue({ enrollment: { id: "e1" }, isStaff: false });
    state.viva = { data: FILA_VIVA };

    expect((await DELETE(...ctx())).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
