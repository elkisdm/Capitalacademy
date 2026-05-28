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
              eq: () => ({
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: "user-id",
                        full_name: "Juan Test",
                        phone: "+56912345678",
                        rut: "12345678-5",
                        ...(typeof args[0] === "object" && args[0] !== null
                          ? args[0]
                          : {}),
                      },
                      error: null,
                    }),
                }),
              }),
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

const { PATCH } = await import(
  "@/app/api/onboarding/complete-profile/route"
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/onboarding/complete-profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  full_name: "Juan Test",
  phone: "+56912345678",
  rut: "12345678-5",
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("PATCH /api/onboarding/complete-profile", () => {
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

    const res = await PATCH(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
  });

  /* ---- Validation ---- */

  it("returns 422 when required fields are missing", async () => {
    const res = await PATCH(makeRequest({ full_name: "Solo Nombre" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
    expect(json.issues.length).toBeGreaterThanOrEqual(2); // phone + rut
  });

  it("returns 422 when RUT is invalid", async () => {
    const res = await PATCH(
      makeRequest({
        full_name: "Juan Test",
        phone: "+56912345678",
        rut: "12345678-0", // wrong check digit
      }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");

    const rutIssue = json.issues.find(
      (i: { path: string[] }) => i.path.includes("rut"),
    );
    expect(rutIssue).toBeDefined();
    expect(rutIssue.message).toBe("RUT inválido");
  });

  /* ---- Happy path ---- */

  it("returns profile on success with valid RUT", async () => {
    const res = await PATCH(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.id).toBe("user-id");
    expect(json.full_name).toBe("Juan Test");
    expect(json.rut).toBe("12345678-5");
    expect(mockUpdateProfile).toHaveBeenCalledOnce();
  });

  it("accepts optional fields as empty strings", async () => {
    const res = await PATCH(
      makeRequest({
        ...VALID_BODY,
        company: "",
        job_title: "",
        linkedin_url: "",
        bio: "",
        address: "",
        emergency_contact_name: "",
        emergency_contact_phone: "",
        birthday: "",
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("user-id");
  });
});
