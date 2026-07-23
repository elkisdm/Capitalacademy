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
const mockProfileUpsertSingle = vi.fn();
const mockAdminUpsertCohortRoles = vi.fn();
const mockAdminUpsertEnrollments = vi.fn();
const mockAdminCohortSingle = vi.fn();
const mockInvitationLogInsert = vi.fn();

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
                single: mockProfileUpsertSingle,
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
      if (table === "cohorts") {
        return {
          select: () => ({
            eq: () => ({
              single: mockAdminCohortSingle,
            }),
          }),
        };
      }
      if (table === "invitation_log") {
        return {
          insert: (...args: unknown[]) => mockInvitationLogInsert(...args),
        };
      }
      return {};
    },
  })),
}));

const mockSendInvitationEmail = vi.fn(
  async (
    ..._args: unknown[]
  ): Promise<{ success: boolean; error?: string }> => ({ success: true }),
);

vi.mock("@/lib/email/invitation", () => ({
  sendInvitationEmail: (...args: unknown[]) => mockSendInvitationEmail(...args),
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

    // Default: profile upsert succeeds, reflejando lo que se le pasó
    mockProfileUpsertSingle.mockImplementation(() => {
      const args = mockAdminUpsertProfile.mock.calls.at(-1)?.[0] as
        | Record<string, unknown>
        | undefined;
      return Promise.resolve({
        data: {
          id: "new-user-id",
          email: args?.email,
          full_name: args?.full_name ?? null,
          system_role: args?.system_role ?? "user",
        },
        error: null,
      });
    });

    // Default: no hay cohorte (solo se consulta si cohort_id + send_invite)
    mockAdminCohortSingle.mockResolvedValue({ data: null });

    // Default: invitation_log insert sin error
    mockInvitationLogInsert.mockResolvedValue({ error: null });
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

  // Si la consulta del perfil del caller falla o no devuelve fila (network
  // hiccup, fila aún no creada, etc.), el guard debe fallar cerrado: sin
  // confirmar que el caller es "admin", no se permite crear usuarios
  // ops/admin.
  it("fails closed: blocks ops-escalation guard when the caller profile query returns no row", async () => {
    mockCallerProfileSelect.mockResolvedValue({ data: null });

    const res = await POST(
      makeRequest({ email: "escalated@test.com", system_role: "admin" }),
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

  /* ---- Body inválido ---- */

  it("returns 400 when the request body is not valid JSON", async () => {
    const badReq = new Request("http://localhost/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{esto-no-es-json",
    });

    const res = await POST(badReq);
    expect(res).toBeDefined();
    expect(res!.status).toBe(400);
    const json = await res!.json();
    expect(json.error).toBe("Body inválido");
  });

  /* ---- Falla del perfil tras crear el usuario en auth ---- */

  it("returns 500 when the profile upsert fails after auth user was created", async () => {
    mockProfileUpsertSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "constraint violation" },
    });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const res = await POST(makeRequest({ email: "profilefail@test.com" }));
    expect(res).toBeDefined();
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toBe("Usuario creado en auth pero falló el perfil");
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  /* ---- Envío de invitación ---- */

  it("sends invitation email with cohort/program names when cohort_id is present", async () => {
    mockAdminCohortSingle.mockResolvedValueOnce({
      data: { name: "Cohorte G5", programs: { name: "Diplomado" } },
    });
    mockSendInvitationEmail.mockResolvedValueOnce({ success: true });

    const res = await POST(
      makeRequest({
        email: "invitee@test.com",
        full_name: "Invitee Test",
        cohort_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        send_invite: true,
      }),
    );

    expect(res).toBeDefined();
    expect(res!.status).toBe(201);
    const json = await res!.json();
    expect(json.invite_error).toBeUndefined();
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "invitee@test.com",
        fullName: "Invitee Test",
        programName: "Diplomado",
        cohortName: "Cohorte G5",
      }),
    );
    expect(mockInvitationLogInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent", email: "invitee@test.com" }),
    );
  });

  it("falls back to default program/cohort names when the cohort lookup returns nothing", async () => {
    mockAdminCohortSingle.mockResolvedValueOnce({ data: null });
    mockSendInvitationEmail.mockResolvedValueOnce({ success: true });

    const res = await POST(
      makeRequest({
        email: "orphancohort@test.com",
        cohort_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        send_invite: true,
      }),
    );

    expect(res).toBeDefined();
    expect(res!.status).toBe(201);
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        programName: "Capital Academy",
        cohortName: "Sin cohorte",
      }),
    );
  });

  it("falls back fullName to email when full_name is omitted and send_invite is true", async () => {
    mockSendInvitationEmail.mockResolvedValueOnce({ success: true });

    const res = await POST(
      makeRequest({ email: "noname@test.com", send_invite: true }),
    );

    expect(res).toBeDefined();
    expect(res!.status).toBe(201);
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "noname@test.com",
        programName: "Capital Academy",
        cohortName: "Sin cohorte",
      }),
    );
    // Sin cohort_id no se consulta la tabla cohorts
    expect(mockAdminCohortSingle).not.toHaveBeenCalled();
  });

  it("returns 201 with invite_error when sendInvitationEmail fails, and logs the failure", async () => {
    mockSendInvitationEmail.mockResolvedValueOnce({
      success: false,
      error: "Resend caído",
    });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const res = await POST(
      makeRequest({ email: "emailfail@test.com", send_invite: true }),
    );

    expect(res).toBeDefined();
    expect(res!.status).toBe(201);
    const json = await res!.json();
    expect(json.invite_error).toBe("Resend caído");
    expect(mockInvitationLogInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "invitation email failed",
      "Resend caído",
    );

    consoleErrorSpy.mockRestore();
  });

  it("logs but does not fail the request when the invitation_log insert itself fails", async () => {
    mockInvitationLogInsert.mockResolvedValueOnce({
      error: { message: "insert failed" },
    });
    mockSendInvitationEmail.mockResolvedValueOnce({ success: true });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const res = await POST(
      makeRequest({ email: "loginsertfail@test.com", send_invite: true }),
    );

    expect(res).toBeDefined();
    expect(res!.status).toBe(201);
    // Esperamos a que la promesa .then() de invitation_log corra su callback.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "invitation_log insert failed:",
      { message: "insert failed" },
    );

    consoleErrorSpy.mockRestore();
  });
});
