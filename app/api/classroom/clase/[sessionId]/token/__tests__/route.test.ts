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

const mockSolicitud = vi.fn();
/** Fila de `room_guests`: la credencial del invitado sin cuenta (0099). */
const mockGuest = vi.fn();
/** La cookie que nombra esa fila. */
const mockCookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mockCookieGet }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        // Encadenable: la consulta de la sala de espera filtra por sesión Y por
        // persona, así que necesita dos `.eq()` seguidos.
        const chain = {
          eq: () => chain,
          maybeSingle:
            table === "class_sessions"
              ? mockSession
              : table === "room_join_requests"
                ? mockSolicitud
                : table === "room_guests"
                  ? mockGuest
                  : mockProfile,
        };
        return chain;
      },
    }),
  }),
}));

vi.mock("@/lib/classroom/access", () => ({
  getClassroomAccess: (...args: unknown[]) => mockAccess(...args),
}));

const { POST } = await import("@/app/api/classroom/clase/[sessionId]/token/route");

const AHORA = new Date("2026-08-06T15:30:00Z");

/** Código legible de reunión (migración 0089), el formato real de la URL. */
const CODIGO = "xkw-mqtd-abn";
const UUID = "ffffffff-0000-0000-0000-0000000000aa";

function req(sessionId: string = CODIGO) {
  return [
    new Request(`http://localhost/api/classroom/clase/${sessionId}/token`, { method: "POST" }),
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
      id: "ses-uuid-real",
      cohort_id: "cohorte-1",
      starts_at: "2026-08-06T15:00:00Z",
      ends_at: "2026-08-06T17:00:00Z",
      modality: "live_online",
      guest_access: false,
    },
    error: null,
  });
  mockProfile.mockResolvedValue({ data: { full_name: "Ana Pérez", email: "ana@x.cl" } });
  mockSolicitud.mockResolvedValue({ data: null });
  mockGuest.mockResolvedValue({ data: null });
  mockCookieGet.mockReturnValue(undefined);
  mockAccess.mockResolvedValue({ enrollment: { id: "enr-1" }, isStaff: false });
});

describe("POST /api/classroom/clase/[sessionId]/token", () => {
  it("emite un token para el alumno matriculado", async () => {
    const res = await POST(...req());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.url).toBe("wss://livekit.example");
    expect(body.room).toBe("clase-ses-uuid-real");
    expect(body.role).toBe("student");
    expect(typeof body.token).toBe("string");
  });

  it("acepta también el UUID, que es lo que llevan los correos ya enviados", async () => {
    expect((await POST(...req(UUID))).status).toBe(200);
  });

  it("rechaza una referencia que no es ni código ni UUID, sin consultar la base", async () => {
    const res = await POST(...req("../../etc/passwd"));

    expect(res.status).toBe(404);
    expect(mockSession).not.toHaveBeenCalled();
  });

  it("la sala del token se deriva de la FILA, no de lo que venga en la URL", async () => {
    const body = await (await POST(...req())).json();
    const payload = decodePayload(body.token);
    expect(payload.video.room).toBe("clase-ses-uuid-real");
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

  it("rechaza a quien no está autenticado en una sala normal", async () => {
    // Desde 0099 esto ya no puede resolverse sin leer la sesión: hay que saber
    // si la sala admite invitados antes de decidir. Se responde 404 —el mismo
    // "no encontramos esta clase" del invitado sin permiso— para no revelar que
    // el código existe pero está cerrado.
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(...req());

    expect(res.status).toBe(404);
    expect((await res.json()).token).toBeUndefined();
  });

  it("a quien no tiene acceso se le ofrece pedir entrar (sala de espera)", async () => {
    mockAccess.mockResolvedValue(null);

    const res = await POST(...req());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.reason).toBe("needs_approval");
    expect(body.puedeSolicitar).toBe(true);
  });

  it("con la solicitud APROBADA entra como alumno, sin matrícula", async () => {
    mockAccess.mockResolvedValue(null);
    mockSolicitud.mockResolvedValue({ data: { status: "approved" } });

    const res = await POST(...req());

    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe("student");
  });

  it("con la solicitud pendiente sigue esperando, sin token", async () => {
    mockAccess.mockResolvedValue(null);
    mockSolicitud.mockResolvedValue({ data: { status: "pending" } });

    const res = await POST(...req());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.esperando).toBe(true);
  });

  it("rechazado no recibe token por más que reintente", async () => {
    mockAccess.mockResolvedValue(null);
    mockSolicitud.mockResolvedValue({ data: { status: "denied" } });

    expect((await POST(...req())).status).toBe(403);
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
        id: "ses-uuid-real",
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

/**
 * Invitados SIN CUENTA (ADR-0035, migración 0099). Es la rama más expuesta de
 * esta ruta: la recorre gente de la que no sabemos absolutamente nada.
 */
describe("POST .../token — invitado sin cuenta", () => {
  /** Sesión abierta a invitados, con una fila de invitado en el estado dado. */
  function salaAbierta(status: "pending" | "approved" | "denied" | null) {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockSession.mockResolvedValue({
      data: {
        id: "ses-uuid-real",
        cohort_id: "cohorte-1",
        starts_at: "2026-08-06T15:00:00Z",
        ends_at: "2026-08-06T17:00:00Z",
        modality: "live_online",
        guest_access: true,
      },
      error: null,
    });
    mockCookieGet.mockReturnValue({ value: "guest-uuid-1" });
    mockGuest.mockResolvedValue({
      data: status ? { id: "guest-uuid-1", display_name: "Diego", status } : null,
    });
  }

  it("emite token al invitado aprobado, marcándolo como invitado en la sala", async () => {
    salaAbierta("approved");

    const res = await POST(...req());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.role).toBe("guest");
    expect(body.room).toBe("clase-ses-uuid-real");

    const payload = decodePayload(body.token);
    expect(payload.name).toBe("Diego (invitado)");
    expect(payload.sub).toBe("guest-guest-uuid-1");
    expect(payload.video.canPublish).toBe(true);
    // Lo que no puede tener NUNCA: moderación.
    expect(payload.video.roomAdmin).toBeUndefined();
  });

  it("no emite token mientras el docente no lo acepta", async () => {
    salaAbierta("pending");

    const res = await POST(...req());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.esperando).toBe(true);
    expect(body.token).toBeUndefined();
  });

  it("no emite token a quien fue rechazado", async () => {
    salaAbierta("denied");

    const res = await POST(...req());
    expect(res.status).toBe(403);
    expect((await res.json()).token).toBeUndefined();
  });

  it("no emite token sin cookie: sin solicitud no hay invitado", async () => {
    salaAbierta(null);
    mockCookieGet.mockReturnValue(undefined);

    const res = await POST(...req());
    expect(res.status).toBe(401);
  });

  it("la credencial de otra clase no sirve: la fila se lee acotada a ESTA sesión", async () => {
    salaAbierta("approved");
    // El filtro por `session_id` de la ruta hace que la consulta no devuelva nada
    // cuando la cookie es de otra clase.
    mockGuest.mockResolvedValue({ data: null });

    const res = await POST(...req());
    expect(res.status).toBe(401);
  });

  it("una sala que NO admite invitados responde como si no existiera", async () => {
    salaAbierta("approved");
    mockSession.mockResolvedValue({
      data: {
        id: "ses-uuid-real",
        cohort_id: "cohorte-1",
        starts_at: "2026-08-06T15:00:00Z",
        ends_at: "2026-08-06T17:00:00Z",
        modality: "live_online",
        guest_access: false,
      },
      error: null,
    });

    const res = await POST(...req());
    // 404 y no 403: distinguir los dos casos convertiría esto en un detector de
    // códigos de reunión válidos.
    expect(res.status).toBe(404);
  });

  it("mantiene fuera al invitado aprobado si la sala ya cerró", async () => {
    salaAbierta("approved");
    vi.setSystemTime(new Date("2026-08-06T19:30:00Z"));

    const res = await POST(...req());
    expect(res.status).toBe(409);
  });

  it("sigue rechazando a quien no tiene sesión en una sala normal", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(...req());
    expect(res.status).toBe(404);
    expect((await res.json()).token).toBeUndefined();
  });
});
