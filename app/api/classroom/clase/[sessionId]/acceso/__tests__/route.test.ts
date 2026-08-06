import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Sala de espera. Frontera nueva: acá se decide quién puede pedir entrar a una
 * clase donde no está matriculado, y quién puede aprobar esas solicitudes.
 */

const mockGetUser = vi.fn();
const mockSession = vi.fn();
const mockAccess = vi.fn();
const mockPropia = vi.fn();
const mockPendientes = vi.fn();
const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
/** Filtros del UPDATE, para verificar que se acota a la sesión y persona correctas. */
const updateFiltros: Array<[string, unknown]> = [];
let updateValues: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      if (tabla === "class_sessions") {
        return { select: () => ({ eq: () => ({ maybeSingle: mockSession }) }) };
      }
      // room_join_requests
      return {
        select: () => {
          const chain = {
            eq: () => chain,
            order: () => mockPendientes(),
            maybeSingle: mockPropia,
          };
          return chain;
        },
        upsert: (v: unknown, o: unknown) => mockUpsert(v, o),
        update: (v: Record<string, unknown>) => {
          updateValues = v;
          const chain = {
            eq: (c: string, val: unknown) => {
              updateFiltros.push([c, val]);
              return chain;
            },
            select: () => chain,
            maybeSingle: mockUpdate,
          };
          return chain;
        },
      };
    },
  }),
}));

vi.mock("@/lib/classroom/access", () => ({
  getClassroomAccess: (...a: unknown[]) => mockAccess(...a),
}));

const { GET, POST } = await import("@/app/api/classroom/clase/[sessionId]/acceso/route");

const CODIGO = "xkw-mqtd-abn";
const OTRO = "11111111-2222-4333-8444-555555555555";
let usuarios = 0;
let userId = "u1";

function ctx(sessionId = CODIGO) {
  return { params: Promise.resolve({ sessionId }) };
}
function post(body: unknown, sessionId = CODIGO) {
  return [
    new Request(`http://localhost/api/classroom/clase/${sessionId}/acceso`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx(sessionId),
  ] as const;
}
function get(sessionId = CODIGO) {
  return [
    new Request(`http://localhost/api/classroom/clase/${sessionId}/acceso`),
    ctx(sessionId),
  ] as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-06T15:30:00Z"));
  userId = `u${++usuarios}`;
  updateFiltros.length = 0;
  updateValues = null;

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
  // Por defecto: alguien SIN matrícula ni rol — el caso de la sala de espera.
  mockAccess.mockResolvedValue(null);
  mockPropia.mockResolvedValue({ data: null });
  mockPendientes.mockResolvedValue({ data: [] });
  mockUpsert.mockResolvedValue({ error: null });
  mockUpdate.mockResolvedValue({ data: { user_id: OTRO }, error: null });
});

describe("POST /acceso — pedir entrar", () => {
  it("registra la solicitud de quien no está matriculado", async () => {
    const res = await POST(...post({ action: "request" }));

    expect(res.status).toBe(200);
    expect((await res.json()).estado).toBe("pending");
    expect(mockUpsert).toHaveBeenCalled();
  });

  it("reutiliza la fila en vez de acumular una por cada clic", async () => {
    await POST(...post({ action: "request" }));

    const [, opciones] = mockUpsert.mock.calls[0];
    expect(opciones).toMatchObject({ onConflict: "session_id,user_id" });
  });

  it("volver a pedir tras un rechazo vuelve a dejarla pendiente", async () => {
    await POST(...post({ action: "request" }));

    const [valores] = mockUpsert.mock.calls[0];
    expect(valores).toMatchObject({ status: "pending", decided_at: null, decided_by: null });
  });

  it("quien YA puede entrar no ensucia la lista del docente", async () => {
    mockAccess.mockResolvedValue({ enrollment: null, isStaff: true });

    const res = await POST(...post({ action: "request" }));

    expect(res.status).toBe(409);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("no se puede pedir entrar a una clase fuera de horario", async () => {
    vi.setSystemTime(new Date("2026-08-07T10:00:00Z"));

    const res = await POST(...post({ action: "request" }));

    expect(res.status).toBe(409);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("no se puede pedir entrar a una clase grabada", async () => {
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

    expect((await POST(...post({ action: "request" }))).status).toBe(409);
  });
});

describe("POST /acceso — decidir", () => {
  it("el docente aprueba y la fila queda approved", async () => {
    mockAccess.mockResolvedValue({ enrollment: null, isStaff: true });

    const res = await POST(...post({ action: "approve", userId: OTRO }));

    expect(res.status).toBe(200);
    expect(updateValues).toMatchObject({ status: "approved", decided_by: userId });
  });

  it("el docente rechaza", async () => {
    mockAccess.mockResolvedValue({ enrollment: null, isStaff: true });

    await POST(...post({ action: "deny", userId: OTRO }));

    expect(updateValues).toMatchObject({ status: "denied" });
  });

  it("la decisión se acota a ESA sesión y ESA persona", async () => {
    // Sin ambos filtros, aprobar una solicitud aprobaría también las de otras
    // clases de la misma persona.
    mockAccess.mockResolvedValue({ enrollment: null, isStaff: true });

    await POST(...post({ action: "approve", userId: OTRO }));

    expect(updateFiltros).toContainEqual(["session_id", "ses-uuid"]);
    expect(updateFiltros).toContainEqual(["user_id", OTRO]);
  });

  it("un ALUMNO no puede aprobar solicitudes", async () => {
    mockAccess.mockResolvedValue({ enrollment: { id: "e1" }, isStaff: false });

    const res = await POST(...post({ action: "approve", userId: OTRO }));

    expect(res.status).toBe(403);
    expect(updateValues).toBeNull();
  });

  it("quien no tiene nada que ver con la clase tampoco aprueba", async () => {
    const res = await POST(...post({ action: "approve", userId: OTRO }));

    expect(res.status).toBe(403);
    expect(updateValues).toBeNull();
  });

  it("404 si la solicitud ya no existe", async () => {
    mockAccess.mockResolvedValue({ enrollment: null, isStaff: true });
    mockUpdate.mockResolvedValue({ data: null, error: null });

    expect((await POST(...post({ action: "approve", userId: OTRO }))).status).toBe(404);
  });

  it("exige un userId con forma de UUID", async () => {
    mockAccess.mockResolvedValue({ enrollment: null, isStaff: true });

    expect((await POST(...post({ action: "approve", userId: "yo" }))).status).toBe(422);
  });
});

describe("GET /acceso", () => {
  it("a quien no es staff le devuelve SOLO su estado", async () => {
    // Quién más pide entrar a la clase no le incumbe a un alumno.
    mockPropia.mockResolvedValue({ data: { status: "pending" } });

    const body = await (await GET(...get())).json();

    expect(body).toEqual({ estado: "pending", pendientes: null });
    expect(mockPendientes).not.toHaveBeenCalled();
  });

  it("al docente le devuelve la lista de pendientes con nombre", async () => {
    mockAccess.mockResolvedValue({ enrollment: null, isStaff: true });
    mockPendientes.mockResolvedValue({
      data: [
        {
          user_id: OTRO,
          created_at: "2026-08-06T15:25:00Z",
          profiles: { full_name: "Ana Pérez", email: "ana@x.cl" },
        },
      ],
    });

    const body = await (await GET(...get())).json();

    expect(body.pendientes).toEqual([
      { userId: OTRO, nombre: "Ana Pérez", desde: "2026-08-06T15:25:00Z" },
    ]);
  });

  it("cae al correo cuando el perfil no tiene nombre", async () => {
    mockAccess.mockResolvedValue({ enrollment: null, isStaff: true });
    mockPendientes.mockResolvedValue({
      data: [{ user_id: OTRO, created_at: "x", profiles: { full_name: null, email: "ana@x.cl" } }],
    });

    expect((await (await GET(...get())).json()).pendientes[0].nombre).toBe("ana@x.cl");
  });
});

describe("guardas comunes", () => {
  it("rechaza a quien no está autenticado", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    expect((await POST(...post({ action: "request" }))).status).toBe(401);
    expect((await GET(...get())).status).toBe(401);
  });

  it("404 si la referencia de la clase es basura", async () => {
    const res = await POST(...post({ action: "request" }, "../../etc/passwd"));

    expect(res.status).toBe(404);
    expect(mockSession).not.toHaveBeenCalled();
  });

  it("404 si la clase no existe", async () => {
    mockSession.mockResolvedValue({ data: null, error: null });

    expect((await POST(...post({ action: "request" }))).status).toBe(404);
  });

  it("rechaza un cuerpo que no es JSON", async () => {
    const res = await POST(
      new Request(`http://localhost/api/classroom/clase/${CODIGO}/acceso`, { method: "POST" }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("limita la tasa de solicitudes", async () => {
    let ultima = 200;
    for (let i = 0; i < 12; i++) ultima = (await POST(...post({ action: "request" }))).status;
    expect(ultima).toBe(429);
  });
});
