import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * La ruta que emite el token de la clase en vivo (ADR-0031). Lo que se protege
 * acá es que NADA de lo que decide el acceso venga del cliente: ni la sala, ni
 * la cohorte, ni el nombre con que aparece en la sala.
 */

const mockGetUser = vi.fn();
const mockSession = vi.fn();
const mockProfile = vi.fn();
const mockAccess = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: table === "class_sessions" ? mockSession : mockProfile,
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/classroom/access", () => ({
  getClassroomAccess: (...args: unknown[]) => mockAccess(...args),
}));

const { POST } = await import("@/app/api/classroom/clase/[sessionId]/token/route");

const AHORA = new Date("2026-08-06T15:30:00Z");

function req(sessionId = "ses-1") {
  return [
    new Request("http://localhost/api/classroom/clase/ses-1/token", { method: "POST" }),
    { params: Promise.resolve({ sessionId }) },
  ] as const;
}

function decodePayload(token: string) {
  const p = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(p, "base64").toString());
}

/**
 * El limitador de tasa vive a nivel de módulo y no se puede reiniciar desde
 * afuera: si todos los tests usaran el mismo usuario, el 11º pedido de la suite
 * daría 429 y los tests siguientes fallarían por una razón que no es la suya.
 * Cada test estrena usuario.
 */
let usuarios = 0;
let userId = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);

  userId = `user-${++usuarios}`;

  process.env.LIVEKIT_URL = "wss://livekit.example";
  process.env.LIVEKIT_API_KEY = "APIkey";
  process.env.LIVEKIT_API_SECRET = "secreto-de-prueba";

  mockGetUser.mockResolvedValue({ data: { user: { id: userId } } });
  mockSession.mockResolvedValue({
    data: {
      id: "ses-1",
      cohort_id: "cohorte-1",
      starts_at: "2026-08-06T15:00:00Z",
      ends_at: "2026-08-06T17:00:00Z",
      modality: "live_online",
    },
    error: null,
  });
  mockProfile.mockResolvedValue({ data: { full_name: "Ana Pérez", email: "ana@x.cl" } });
  mockAccess.mockResolvedValue({ enrollment: { id: "enr-1" }, isStaff: false });
});

describe("POST /api/classroom/clase/[sessionId]/token", () => {
  it("emite un token para el alumno matriculado", async () => {
    const res = await POST(...req());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.url).toBe("wss://livekit.example");
    expect(body.room).toBe("clase-ses-1");
    expect(body.role).toBe("student");
    expect(typeof body.token).toBe("string");
  });

  it("la sala del token se deriva de la sesión, no del cliente", async () => {
    const body = await (await POST(...req())).json();
    const payload = decodePayload(body.token);
    expect(payload.video.room).toBe("clase-ses-1");
    expect(payload.sub).toBe(userId);
  });

  it("verifica la matrícula contra la cohorte de la SESIÓN", async () => {
    await POST(...req());
    // Si se verificara contra una cohorte enviada por el cliente, bastaría
    // mandar la propia para entrar a la clase de otra.
    expect(mockAccess).toHaveBeenCalledWith(userId, "cohorte-1");
  });

  it("el nombre visible sale del perfil, no del cliente", async () => {
    const body = await (await POST(...req())).json();
    expect(decodePayload(body.token).name).toBe("Ana Pérez");
  });

  it("cae al correo cuando el perfil no tiene nombre", async () => {
    mockProfile.mockResolvedValue({ data: { full_name: null, email: "ana@x.cl" } });
    const body = await (await POST(...req())).json();
    expect(decodePayload(body.token).name).toBe("ana@x.cl");
  });

  it("el token vence con la clase más la gracia de reconexión", async () => {
    const body = await (await POST(...req())).json();
    expect(body.expiresAt).toBe("2026-08-06T19:00:00.000Z");
    expect(decodePayload(body.token).exp).toBe(
      Math.floor(Date.parse("2026-08-06T19:00:00Z") / 1000),
    );
  });

  it("el staff recibe permisos de moderación", async () => {
    mockAccess.mockResolvedValue({ enrollment: null, isStaff: true });
    const body = await (await POST(...req())).json();
    expect(body.role).toBe("teacher");
    expect(decodePayload(body.token).video.roomAdmin).toBe(true);
  });

  it("el alumno NO recibe permisos de moderación", async () => {
    const body = await (await POST(...req())).json();
    expect(decodePayload(body.token).video.roomAdmin).toBeUndefined();
  });

  it("rechaza a quien no está autenticado, sin tocar la base", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(...req());

    expect(res.status).toBe(401);
    expect(mockSession).not.toHaveBeenCalled();
  });

  it("rechaza a quien no tiene acceso a la cohorte", async () => {
    mockAccess.mockResolvedValue(null);
    const res = await POST(...req());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/matriculado/i);
  });

  it("responde 404 si la clase no existe", async () => {
    mockSession.mockResolvedValue({ data: null, error: null });
    expect((await POST(...req())).status).toBe(404);
  });

  it("responde 500 si falla la lectura de la clase", async () => {
    mockSession.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await POST(...req())).status).toBe(500);
  });

  it("no emite token para una clase grabada", async () => {
    mockSession.mockResolvedValue({
      data: {
        id: "ses-1",
        cohort_id: "cohorte-1",
        starts_at: "2026-08-06T15:00:00Z",
        ends_at: "2026-08-06T17:00:00Z",
        modality: "recorded",
      },
      error: null,
    });
    expect((await POST(...req())).status).toBe(409);
  });

  it("no emite token al alumno fuera de la ventana de la sala", async () => {
    vi.setSystemTime(new Date("2026-08-06T09:00:00Z"));
    const res = await POST(...req());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/30 minutos antes/i);
  });

  it("responde 503 nombrando la variable cuando falta configuración", async () => {
    delete process.env.LIVEKIT_API_SECRET;
    const res = await POST(...req());
    expect(res.status).toBe(503);
    expect((await res.json()).missing).toEqual(["LIVEKIT_API_SECRET"]);
  });

  it("limita la tasa por usuario", async () => {
    // 10/min: el 11º pedido del mismo usuario se corta.
    let ultima = 200;
    for (let i = 0; i < 12; i++) {
      ultima = (await POST(...req())).status;
    }
    expect(ultima).toBe(429);
  });
});
