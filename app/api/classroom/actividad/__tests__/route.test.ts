import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks controlables
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();
const mockResolveCohortSlug = vi.fn();
const mockEnrollmentMaybeSingle = vi.fn();
const mockRpc = vi.fn();
/** Filtros aplicados a la consulta de enrollments, para verificar el scoping. */
const enrollmentFilters: Array<[string, unknown]> = [];
let orderCalled = false;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    from: (table: string) => {
      if (table !== "enrollments") return {};
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          enrollmentFilters.push([column, value]);
          return chain;
        },
        order: () => {
          orderCalled = true;
          return chain;
        },
        limit: () => chain,
        maybeSingle: mockEnrollmentMaybeSingle,
      };
      return chain;
    },
  }),
}));

vi.mock("@/lib/classroom/resolve-slugs", () => ({
  resolveCohortSlug: (...args: unknown[]) => mockResolveCohortSlug(...args),
}));

const { POST } = await import("@/app/api/classroom/actividad/route");
const { ACTIVITY_MAX_GAP_SECONDS } = await import("@/lib/classroom/actividad");

const USER = { id: "00000000-1111-4222-8333-444444444444" };
const ENROLLMENT_ID = "11111111-2222-4333-8444-555555555555";

function makeRequest(body?: unknown, raw?: string) {
  return new Request("http://localhost/api/classroom/actividad", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw !== undefined ? raw : JSON.stringify(body ?? {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  enrollmentFilters.length = 0;
  orderCalled = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ===========================================================================
describe("POST /api/classroom/actividad", () => {
  // ---- auth ---------------------------------------------------------------
  it("devuelve 401 sin sesión y no escribe nada", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // ---- validación ---------------------------------------------------------
  it("devuelve 422 cuando el cuerpo tiene la forma equivocada", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });

    const res = await POST(makeRequest({ cohortSlug: 42 }));

    expect(res.status).toBe(422);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("trata un cuerpo ilegible como vacío en vez de fallar", async () => {
    // El latido puede salir con keepalive durante el descargue de la página:
    // perder telemetría no justifica un 400.
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: { id: ENROLLMENT_ID } });
    mockRpc.mockResolvedValue({ data: { active_seconds: 60 }, error: null });

    const res = await POST(makeRequest(undefined, "esto no es json"));

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalled();
  });

  // ---- resolución de matrícula --------------------------------------------
  it("devuelve 204 y no escribe cuando el usuario no tiene matrícula activa", async () => {
    // Caso típico: staff recorriendo el classroom en vista previa. Su paseo no
    // debe contarse como actividad de alumno.
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: null });

    const res = await POST(makeRequest());

    expect(res.status).toBe(204);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("sin cohortSlug cae a la matrícula activa más reciente", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: { id: ENROLLMENT_ID } });
    mockRpc.mockResolvedValue({ data: {}, error: null });

    await POST(makeRequest());

    expect(mockResolveCohortSlug).not.toHaveBeenCalled();
    expect(orderCalled).toBe(true);
    expect(enrollmentFilters).toContainEqual(["student_id", USER.id]);
    expect(enrollmentFilters).toContainEqual(["status", "active"]);
  });

  it("con cohortSlug acota la matrícula a esa cohorte", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockResolveCohortSlug.mockResolvedValue("cohort-123");
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: { id: ENROLLMENT_ID } });
    mockRpc.mockResolvedValue({ data: {}, error: null });

    await POST(makeRequest({ cohortSlug: "diplomado-g4" }));

    expect(mockResolveCohortSlug).toHaveBeenCalledWith("diplomado-g4");
    expect(enrollmentFilters).toContainEqual(["cohort_id", "cohort-123"]);
    expect(orderCalled).toBe(false);
  });

  it("devuelve 204 cuando el slug no resuelve a ninguna cohorte", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockResolveCohortSlug.mockResolvedValue(null);

    const res = await POST(makeRequest({ cohortSlug: "no-existe" }));

    expect(res.status).toBe(204);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("NO cae a otra matrícula cuando el alumno no está en la cohorte de la ruta", async () => {
    // Acreditarle a la cohorte B el tiempo que pasó mirando la cohorte A
    // ensuciaría los dos reportes.
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockResolveCohortSlug.mockResolvedValue("cohort-ajena");
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: null });

    const res = await POST(makeRequest({ cohortSlug: "cohorte-ajena" }));

    expect(res.status).toBe(204);
    expect(orderCalled).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // ---- acreditación del tiempo ---------------------------------------------
  it("un latido normal acredita hasta el tope, con el día de Chile", async () => {
    vi.useFakeTimers();
    // 02:00 UTC del 5-ago es todavía el 4-ago en Chile.
    vi.setSystemTime(new Date("2026-08-05T02:00:00Z"));

    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: { id: ENROLLMENT_ID } });
    mockRpc.mockResolvedValue({ data: { active_seconds: 120 }, error: null });

    const res = await POST(makeRequest({ resumed: false }));

    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("record_student_activity", {
      p_enrollment_id: ENROLLMENT_ID,
      p_activity_date: "2026-08-04",
      p_max_gap_seconds: ACTIVITY_MAX_GAP_SECONDS,
    });
    expect(await res.json()).toEqual({ active_seconds: 120 });
  });

  it("un latido de reanudación acredita CERO segundos", async () => {
    // Volver después de 40 minutos en otra pestaña no debe regalar el tope.
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: { id: ENROLLMENT_ID } });
    mockRpc.mockResolvedValue({ data: {}, error: null });

    await POST(makeRequest({ resumed: true }));

    expect(mockRpc).toHaveBeenCalledWith(
      "record_student_activity",
      expect.objectContaining({ p_max_gap_seconds: 0 }),
    );
  });

  it("sin la bandera resumed acredita como latido normal", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: { id: ENROLLMENT_ID } });
    mockRpc.mockResolvedValue({ data: {}, error: null });

    await POST(makeRequest({}));

    expect(mockRpc).toHaveBeenCalledWith(
      "record_student_activity",
      expect.objectContaining({ p_max_gap_seconds: ACTIVITY_MAX_GAP_SECONDS }),
    );
  });

  it("responde un objeto vacío cuando la función no devuelve nada", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: { id: ENROLLMENT_ID } });
    mockRpc.mockResolvedValue({ data: null, error: null });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  // ---- degradación ---------------------------------------------------------
  it("devuelve 503 con Retry-After ante un statement timeout", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: { id: ENROLLMENT_ID } });
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout" },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("devuelve 500 ante cualquier otro error, sin lanzar", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockEnrollmentMaybeSingle.mockResolvedValue({ data: { id: ENROLLMENT_ID } });
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(res.headers.get("Retry-After")).toBeNull();
  });
});
