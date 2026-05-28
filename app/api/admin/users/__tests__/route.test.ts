import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockAuthorizeAdmin = vi.fn();

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: (...args: unknown[]) => mockAuthorizeAdmin(...args),
}));

const mockCallerProfileSelect = vi.fn();
const mockSupabaseFrom = vi.fn((table: string) => {
  if (table === "profiles") {
    return {
      select: () => ({
        eq: () => ({
          single: mockCallerProfileSelect,
        }),
      }),
    };
  }
  return {};
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (...args: unknown[]) => mockSupabaseFrom(...(args as [string])),
  })),
}));

const mockGenerateLink = vi.fn();
const mockAdminUpsertProfile = vi.fn();
const mockAdminUpsertCohortRoles = vi.fn();
const mockAdminUpsertEnrollments = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        generateLink: (...args: unknown[]) => mockGenerateLink(...args),
      },
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          upsert: (...args: unknown[]) => {
            mockAdminUpsertProfile(...args);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: "new-user-id",
                      email: (args[0] as Record<string, unknown>)?.email,
                      full_name:
                        (args[0] as Record<string, unknown>)?.full_name ?? null,
                      system_role:
                        (args[0] as Record<string, unknown>)?.system_role ??
                        "user",
                    },
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      if (table === "cohort_roles") {
        return {
          upsert: (...args: unknown[]) => {
            mockAdminUpsertCohortRoles(...args);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "enrollments") {
        return {
          upsert: (...args: unknown[]) => {
            mockAdminUpsertEnrollments(...args);
            return Promise.resolve({ error: null });
          },
        };
      }
      return {};
    },
  })),
}));

vi.mock("@/lib/email/invitation", () => ({
  sendInvitationEmail: vi.fn(async () => ({ ok: true })),
}));

/* ------------------------------------------------------------------ */
/*  Import route AFTER mocks are registered                            */
/* ------------------------------------------------------------------ */

const { POST } = await import("@/app/api/admin/users/route");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("POST /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: admin caller
    mockAuthorizeAdmin.mockResolvedValue({
      user: { id: "caller-id", email: "admin@test.com" },
    });

    // Default: caller is admin
    mockCallerProfileSelect.mockResolvedValue({
      data: { system_role: "admin" },
    });

    // Default: generateLink succeeds
    mockGenerateLink.mockResolvedValue({
      data: {
        user: { id: "new-user-id" },
        properties: {
          hashed_token: "tok-hash",
          verification_type: "invite",
        },
      },
      error: null,
    });
  });

  /* ---- Auth ---- */

  it("returns 401 when authorizeAdmin rejects (unauthenticated)", async () => {
    mockAuthorizeAdmin.mockResolvedValue({
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    });

    const res = await POST(makeRequest({ email: "a@b.com" }));
    expect(res).toBeDefined();
    expect(res!.status).toBe(401);
  });

  it("returns 403 when authorizeAdmin rejects (unauthorized role)", async () => {
    mockAuthorizeAdmin.mockResolvedValue({
      error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    });

    const res = await POST(makeRequest({ email: "a@b.com" }));
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
  });

  /* ---- Validation ---- */

  it("returns 422 when email is missing", async () => {
    const res = await POST(makeRequest({ full_name: "Test" }));
    expect(res).toBeDefined();
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("Validación fallida");
  });

  it("returns 422 when email is invalid", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res).toBeDefined();
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.issues).toBeDefined();
    expect(json.issues.length).toBeGreaterThan(0);
  });

  /* ---- Privilege escalation guard ---- */

  it("returns 403 when ops tries to create an admin user", async () => {
    mockCallerProfileSelect.mockResolvedValue({
      data: { system_role: "ops" },
    });

    const res = await POST(
      makeRequest({ email: "new@admin.com", system_role: "admin" }),
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(403);
    const json = await res!.json();
    expect(json.error).toContain("Solo un admin");
  });

  /* ---- Happy path ---- */

  it("returns 201 with profile on success", async () => {
    const res = await POST(
      makeRequest({
        email: "NEW@student.com",
        full_name: "Nuevo Estudiante",
        system_role: "user",
      }),
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(201);
    const json = await res!.json();
    expect(json.id).toBe("new-user-id");
    expect(json.email).toBe("new@student.com");
    expect(json.full_name).toBe("Nuevo Estudiante");
    expect(mockGenerateLink).toHaveBeenCalledOnce();
    expect(mockAdminUpsertProfile).toHaveBeenCalledOnce();
  });

  it("assigns cohort when cohort_id is provided", async () => {
    const res = await POST(
      makeRequest({
        email: "student@test.com",
        full_name: "Con Cohorte",
        cohort_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      }),
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(201);
    expect(mockAdminUpsertCohortRoles).toHaveBeenCalledOnce();
    expect(mockAdminUpsertEnrollments).toHaveBeenCalledOnce();
  });

  it("does not assign cohort when cohort_id is omitted", async () => {
    const res = await POST(
      makeRequest({ email: "nocohort@test.com" }),
    );
    expect(res).toBeDefined();
    expect(res!.status).toBe(201);
    expect(mockAdminUpsertCohortRoles).not.toHaveBeenCalled();
    expect(mockAdminUpsertEnrollments).not.toHaveBeenCalled();
  });

  it("returns 400 when generateLink fails", async () => {
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: "User already exists" },
    });

    const res = await POST(makeRequest({ email: "dup@test.com" }));
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const json = await res!.json();
    expect(json.error).toBe("User already exists");
  });
});
