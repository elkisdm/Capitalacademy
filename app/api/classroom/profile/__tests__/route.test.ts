import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockGetUser = vi.fn();
const mockUpdateProfile = vi.fn();

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
              eq: () => Promise.resolve({ error: null }),
            };
          },
        };
      }
      return {};
    },
  })),
}));

// NOTE: isValidRut is NOT mocked — real RUT validation runs.

/* ------------------------------------------------------------------ */
/*  Import route AFTER mocks are registered                            */
/* ------------------------------------------------------------------ */

const { PATCH } = await import("@/app/api/classroom/profile/route");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/classroom/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("PATCH /api/classroom/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: authenticated user
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-id", email: "test@test.com" } },
    });
  });

  /* ---- Auth ---- */

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await PATCH(makeRequest({ phone: "+56912345678" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
  });

  /* ---- Partial update: staff sin phone/rut puede editar UN campo ---- */

  it("updates only the sent field, without requiring full_name/rut", async () => {
    const res = await PATCH(makeRequest({ phone: "+56912345678" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(mockUpdateProfile).toHaveBeenCalledOnce();
    const updateData = mockUpdateProfile.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(updateData).toEqual({ phone: "+56912345678" });
    expect(updateData.full_name).toBeUndefined();
    expect(updateData.rut).toBeUndefined();
  });

  /* ---- Validation ---- */

  it("returns 422 when body has no fields to update", async () => {
    const res = await PATCH(makeRequest({}));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("No hay campos para actualizar");
  });

  it("returns 422 when RUT is invalid", async () => {
    const res = await PATCH(makeRequest({ rut: "12345678-0" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");

    const rutIssue = json.issues.find((i: { path: string[] }) =>
      i.path.includes("rut"),
    );
    expect(rutIssue).toBeDefined();
    expect(rutIssue.message).toBe("RUT inválido");
  });
});
