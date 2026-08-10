import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Moderación de la sala. Es una frontera de permisos: si esto se afloja, un
 * alumno puede silenciar o expulsar a sus compañeros en plena clase.
 */

const mockGetUser = vi.fn();
const mockSession = vi.fn();
const mockAccess = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockSession }) }) }),
  }),
}));

vi.mock("@/lib/classroom/access", () => ({
  getClassroomAccess: (...a: unknown[]) => mockAccess(...a),
}));

const { POST } = await import("@/app/api/classroom/clase/[sessionId]/moderar/route");

const CODIGO = "xkw-mqtd-abn";
let usuarios = 0;
let userId = "u1";

function req(body: unknown, sessionId = CODIGO) {
  return [
    new Request(`http://localhost/api/classroom/clase/${sessionId}/moderar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ sessionId }) },
  ] as const;
}

/** Última llamada a LiveKit: [endpoint, cuerpo]. */
function ultimaLlamada() {
  const c = fetchMock.mock.calls.at(-1);
  if (!c) return null;
  return [String(c[0]).split("/").pop(), JSON.parse(String((c[1] as RequestInit).body))] as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-06T15:30:00Z"));
  userId = `u${++usuarios}`;

  process.env.LIVEKIT_URL = "wss://livekit.example";
  process.env.LIVEKIT_API_KEY = "APIkey";
  process.env.LIVEKIT_API_SECRET = "secreto-de-prueba";

  mockGetUser.mockResolvedValue({ data: { user: { id: userId } } });
  mockSession.mockResolvedValue({
    data: {
      id: "ses-uuid",
      cohort_id: "cohorte-1",
      starts_at: "2026-08-06T15:00:00Z",
      ends_at: "2026-08-06T17:00:00Z",
      modality: "live_online",
    },
    error: null,
  });
  // Docente por defecto.
  mockAccess.mockResolvedValue({ enrollment: null, isStaff: true });

  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ tracks: [{ sid: "TR_1", source: "MICROPHONE", muted: false }] }),
    text: async () => "",
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("POST /api/classroom/clase/[sessionId]/moderar", () => {
  it("el docente puede sacar a alguien", async () => {
    const res = await POST(...req({ action: "remove", identity: "otro" }));

    expect(res.status).toBe(200);
    const [endpoint, cuerpo] = ultimaLlamada()!;
    expect(endpoint).toBe("RemoveParticipant");
    expect(cuerpo).toMatchObject({ room: "clase-ses-uuid", identity: "otro" });
  });

  it("silenciar resuelve primero el SID de la pista", async () => {
    // `MutePublishedTrack` no acepta solo la identidad: sin el SID no silencia.
    const res = await POST(...req({ action: "mute", identity: "otro" }));

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.map((c) => String(c[0]).split("/").pop())).toEqual([
      "GetParticipant",
      "MutePublishedTrack",
    ]);
    expect(ultimaLlamada()![1]).toMatchObject({ track_sid: "TR_1", muted: true });
  });

  it("si ya estaba en silencio responde ok sin volver a silenciar", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ tracks: [{ sid: "TR_1", source: "MICROPHONE", muted: true }] }),
      text: async () => "",
    });

    const res = await POST(...req({ action: "mute", identity: "otro" }));

    expect(res.status).toBe(200);
    expect((await res.json()).yaEstaba).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un ALUMNO no puede moderar, aunque conozca la ruta", async () => {
    mockAccess.mockResolvedValue({ enrollment: { id: "e1" }, isStaff: false });

    const res = await POST(...req({ action: "remove", identity: "otro" }));

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("quien no tiene acceso a la cohorte tampoco modera", async () => {
    mockAccess.mockResolvedValue(null);

    expect((await POST(...req({ action: "mute", identity: "otro" }))).status).toBe(403);
  });

  it("rechaza a quien no está autenticado", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    expect((await POST(...req({ action: "remove", identity: "otro" }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nadie se modera a sí mismo", async () => {
    const res = await POST(...req({ action: "remove", identity: userId }));

    expect(res.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("valida la acción pedida", async () => {
    expect((await POST(...req({ action: "explotar", identity: "otro" }))).status).toBe(422);
    expect((await POST(...req({ action: "mute" }))).status).toBe(422);
  });

  it("rechaza un cuerpo que no es JSON", async () => {
    const res = await POST(
      new Request(`http://localhost/api/classroom/clase/${CODIGO}/moderar`, {
        method: "POST",
        body: "no-es-json",
      }),
      { params: Promise.resolve({ sessionId: CODIGO }) },
    );
    expect(res.status).toBe(400);
  });

  it("404 si la clase no existe", async () => {
    mockSession.mockResolvedValue({ data: null, error: null });
    expect((await POST(...req({ action: "mute", identity: "otro" }))).status).toBe(404);
  });

  it("el token de servicio dura un minuto y solo sirve para ESA sala", async () => {
    await POST(...req({ action: "remove", identity: "otro" }));

    const auth = String(
      (fetchMock.mock.calls.at(-1)![1] as RequestInit & { headers: Record<string, string> })
        .headers.Authorization,
    ).replace("Bearer ", "");
    const payload = JSON.parse(
      Buffer.from(auth.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    );

    expect(payload.video.room).toBe("clase-ses-uuid");
    expect(payload.video.roomAdmin).toBe(true);
    // Sin permiso de publicar ni suscribirse: es una credencial de gestión.
    expect(payload.video.canPublish).toBe(false);
    expect(payload.exp - payload.iat).toBe(60);
  });

  it("404 si la referencia de la clase no es ni código ni UUID", async () => {
    const res = await POST(...req({ action: "mute", identity: "otro" }, "../../etc/passwd"));

    expect(res.status).toBe(404);
    expect(mockSession).not.toHaveBeenCalled();
  });

  it("503 cuando LiveKit no está configurado", async () => {
    delete process.env.LIVEKIT_API_SECRET;

    expect((await POST(...req({ action: "mute", identity: "otro" }))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404 si la persona a silenciar ya no está en la sala", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => "not found" });

    expect((await POST(...req({ action: "mute", identity: "fantasma" }))).status).toBe(404);
  });

  it("no modera fuera de la ventana de la sala", async () => {
    // El docente entra sin ventana, pero una clase GRABADA no tiene sala que
    // moderar: la decisión de acceso la rechaza igual.
    mockSession.mockResolvedValue({
      data: {
        id: "ses-uuid",
        cohort_id: "cohorte-1",
        starts_at: "2026-08-06T15:00:00Z",
        ends_at: "2026-08-06T17:00:00Z",
        modality: "recorded",
      },
      error: null,
    });

    expect((await POST(...req({ action: "mute", identity: "otro" }))).status).toBe(403);
  });

  it("limita la tasa por usuario", async () => {
    let ultima = 200;
    for (let i = 0; i < 32; i++) {
      ultima = (await POST(...req({ action: "remove", identity: "otro" }))).status;
    }
    expect(ultima).toBe(429);
  });

  it("propaga 502 si LiveKit rechaza la acción", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    expect((await POST(...req({ action: "remove", identity: "otro" }))).status).toBe(502);
  });
});
