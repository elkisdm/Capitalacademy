import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockGetUser = vi.fn();
const mockUpdateProfile = vi.fn();
const mockEq = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: () => mockGetUser(),
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          update: (...args: unknown[]) => {
            mockUpdateProfile(...args);
            return {
              eq: (...eqArgs: unknown[]) => {
                mockEq(...eqArgs);
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      return {};
    },
  })),
}));

/* ------------------------------------------------------------------ */
/*  Import route AFTER mocks are registered                            */
/* ------------------------------------------------------------------ */

const { POST } = await import("@/app/api/classroom/tour/route");

function makeRequest(body: unknown, raw?: string) {
  return new Request("http://localhost/api/classroom/tour", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("POST /api/classroom/tour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "alumno-1", email: "alumno@test.cl" } },
    });
  });

  /* ---- Auth ---- */

  it("responde 401 si no hay sesión", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest({ outcome: "completed" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("No autenticado");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  /* ---- Body ---- */

  it("responde 400 si el body no es JSON", async () => {
    const res = await POST(makeRequest(null, "esto no es json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Body inválido");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("responde 422 si falta el outcome", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
    expect(json.issues.length).toBeGreaterThan(0);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("responde 422 si el outcome no es uno de los dos válidos", async () => {
    const res = await POST(makeRequest({ outcome: "abandonado" }));
    expect(res.status).toBe(422);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  /* ---- Escritura ---- */

  it("guarda outcome 'completed' con la marca de tiempo", async () => {
    const antes = Date.now();
    const res = await POST(makeRequest({ outcome: "completed" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    expect(mockUpdateProfile).toHaveBeenCalledOnce();
    const update = mockUpdateProfile.mock.calls[0][0] as Record<string, string>;
    expect(update.tour_outcome).toBe("completed");
    expect(Date.parse(update.tour_completed_at)).toBeGreaterThanOrEqual(antes - 1000);
  });

  it("guarda outcome 'skipped' cuando el alumno sale antes de terminar", async () => {
    const res = await POST(makeRequest({ outcome: "skipped" }));
    expect(res.status).toBe(200);
    const update = mockUpdateProfile.mock.calls[0][0] as Record<string, string>;
    expect(update.tour_outcome).toBe("skipped");
  });

  it("escribe solo sobre la fila del usuario autenticado", async () => {
    await POST(makeRequest({ outcome: "completed" }));
    expect(mockEq).toHaveBeenCalledWith("id", "alumno-1");
  });

  it("no toca system_role ni role (no dispara el trigger anti-escalada)", async () => {
    await POST(makeRequest({ outcome: "completed" }));
    const update = mockUpdateProfile.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(update).sort()).toEqual(["tour_completed_at", "tour_outcome"]);
  });

  it("ignora campos extra del body", async () => {
    await POST(
      makeRequest({ outcome: "completed", system_role: "admin", id: "otro" }),
    );
    const update = mockUpdateProfile.mock.calls[0][0] as Record<string, unknown>;
    expect(update.system_role).toBeUndefined();
    expect(update.id).toBeUndefined();
    expect(mockEq).toHaveBeenCalledWith("id", "alumno-1");
  });

  /* ---- Error de base de datos ---- */

  it("responde 500 si la escritura falla", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockEq.mockImplementationOnce(() => {});
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: { getUser: () => mockGetUser() },
      from: () => ({
        update: () => ({
          eq: () => Promise.resolve({ error: { code: "42703", message: "boom" } }),
        }),
      }),
      // El mock reproduce solo la superficie que usa la ruta.
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const res = await POST(makeRequest({ outcome: "completed" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("No se pudo guardar el estado del tour");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
