import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockAuthorizeAdmin = vi.fn();

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: (...args: unknown[]) => mockAuthorizeAdmin(...args),
}));

const mockProfileSingle = vi.fn();
const mockEnrollmentSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () => mockProfileSingle(),
            }),
          }),
        };
      }
      if (table === "enrollments") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    single: () => mockEnrollmentSingle(),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  })),
}));

const mockGenerateLink = vi.fn();
const mockInvitationLogInsert = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        generateLink: (...args: unknown[]) => mockGenerateLink(...args),
      },
    },
    from: (table: string) => {
      if (table === "invitation_log") {
        return {
          insert: (...args: unknown[]) => mockInvitationLogInsert(...args),
        };
      }
      return {};
    },
  })),
}));

const mockSendInvitationEmail = vi.fn();

vi.mock("@/lib/email/invitation", () => ({
  sendInvitationEmail: (...args: unknown[]) => mockSendInvitationEmail(...args),
}));

/* ------------------------------------------------------------------ */
/*  Import route AFTER mocks are registered                            */
/* ------------------------------------------------------------------ */

const { POST } = await import("@/app/api/admin/send-invitation/route");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/send-invitation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest() {
  return new Request("http://localhost/api/admin/send-invitation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{esto no es json",
  });
}

const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("POST /api/admin/send-invitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthorizeAdmin.mockResolvedValue({
      user: { id: "caller-id", email: "admin@test.com" },
    });

    mockProfileSingle.mockResolvedValue({
      data: { email: "alumno@test.com", full_name: "Alumno Prueba" },
    });

    mockEnrollmentSingle.mockResolvedValue({
      data: {
        cohort_id: "cohort-1",
        cohorts: { name: "Cohorte A", programs: { name: "Programa X" } },
      },
    });

    mockGenerateLink.mockResolvedValue({
      data: {
        properties: {
          hashed_token: "tok-hash",
          verification_type: "invite",
        },
      },
      error: null,
    });

    mockSendInvitationEmail.mockResolvedValue({ success: true });
    mockInvitationLogInsert.mockResolvedValue({ error: null });
  });

  /* ---- Auth ---- */

  it("returns 401 when authorizeAdmin rejects (unauthenticated)", async () => {
    mockAuthorizeAdmin.mockResolvedValue({
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    });

    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(401);
  });

  it("returns 403 when authorizeAdmin rejects (unauthorized role)", async () => {
    mockAuthorizeAdmin.mockResolvedValue({
      error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    });

    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(403);
  });

  /* ---- Body inválido ---- */

  it("returns 400 when the JSON body cannot be parsed", async () => {
    const res = (await POST(makeInvalidJsonRequest()))!;
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Body inválido");
  });

  /* ---- Validación de userId ---- */

  it("returns 422 when userId is missing", async () => {
    const res = (await POST(makeRequest({})))!;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("userId es requerido");
  });

  /* ---- Usuario no encontrado ---- */

  it("returns 404 when the target profile does not exist", async () => {
    mockProfileSingle.mockResolvedValue({ data: null });

    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Usuario no encontrado");
  });

  /* ---- Cohorte / programa: fallbacks ---- */

  it("falls back to 'Sin cohorte' / 'Capital Academy' when there is no active enrollment", async () => {
    mockEnrollmentSingle.mockResolvedValue({ data: null });

    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(200);
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        cohortName: "Sin cohorte",
        programName: "Capital Academy",
      }),
    );
  });

  it("falls back to 'Capital Academy' as programName when the cohort has no linked program", async () => {
    mockEnrollmentSingle.mockResolvedValue({
      data: { cohort_id: "cohort-1", cohorts: { name: "Cohorte Sola", programs: null } },
    });

    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(200);
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        cohortName: "Cohorte Sola",
        programName: "Capital Academy",
      }),
    );
  });

  it("uses the cohort and program names from the active enrollment when present", async () => {
    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(200);
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        cohortName: "Cohorte A",
        programName: "Programa X",
      }),
    );
  });

  /* ---- full_name ausente ---- */

  it("falls back fullName to the email when full_name is null", async () => {
    mockProfileSingle.mockResolvedValue({
      data: { email: "sinnombre@test.com", full_name: null },
    });

    await POST(makeRequest({ userId: USER_ID }));
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "sinnombre@test.com",
        fullName: "sinnombre@test.com",
      }),
    );
  });

  /* ---- generateLink (invite) camino feliz ---- */

  it("builds the confirm URL from the invite link and sends the invitation email", async () => {
    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: "invite",
      email: "alumno@test.com",
      options: { redirectTo: "https://capitalacademy.cl/onboarding/set-password" },
    });
    expect(mockSendInvitationEmail).toHaveBeenCalledWith({
      email: "alumno@test.com",
      fullName: "Alumno Prueba",
      inviteUrl:
        "https://capitalacademy.cl/auth/confirm?token_hash=tok-hash&type=invite&next=%2Fonboarding%2Fset-password",
      programName: "Programa X",
      cohortName: "Cohorte A",
    });
  });

  it("defaults emailType to 'invite' when verification_type is absent", async () => {
    mockGenerateLink.mockResolvedValue({
      data: { properties: { hashed_token: "tok-sin-tipo" } },
      error: null,
    });

    await POST(makeRequest({ userId: USER_ID }));
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteUrl: expect.stringContaining("type=invite"),
      }),
    );
  });

  /* ---- generateLink (invite) falla por usuario ya registrado -> recovery ---- */

  it("falls back to a recovery link when the user is already registered", async () => {
    mockGenerateLink
      .mockResolvedValueOnce({
        data: null,
        error: { message: "A user with this email address has already been registered" },
      })
      .mockResolvedValueOnce({
        data: {
          properties: { hashed_token: "tok-recovery", verification_type: "recovery" },
        },
        error: null,
      });

    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(200);

    expect(mockGenerateLink).toHaveBeenCalledTimes(2);
    expect(mockGenerateLink).toHaveBeenNthCalledWith(2, {
      type: "recovery",
      email: "alumno@test.com",
      options: { redirectTo: "https://capitalacademy.cl/onboarding/set-password" },
    });
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteUrl: expect.stringContaining("type=recovery"),
      }),
    );
  });

  it("returns 500 when both the invite link and the recovery fallback fail", async () => {
    mockGenerateLink
      .mockResolvedValueOnce({
        data: null,
        error: { message: "already been registered" },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "SMTP no disponible" },
      });

    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al generar enlace: SMTP no disponible");
    expect(mockSendInvitationEmail).not.toHaveBeenCalled();
  });

  /* ---- generateLink (invite) falla por otra razón ---- */

  it("returns 500 with the provider's message when generateLink fails for a reason other than duplicate registration", async () => {
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: "Rate limit exceeded" },
    });

    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe(
      "Error al generar enlace de invitación: Rate limit exceeded",
    );
    expect(mockGenerateLink).toHaveBeenCalledTimes(1);
    expect(mockSendInvitationEmail).not.toHaveBeenCalled();
  });

  /* ---- sendInvitationEmail falla ---- */

  it("returns 500 with the provider's message when sendInvitationEmail fails", async () => {
    mockSendInvitationEmail.mockResolvedValue({
      success: false,
      error: "Resend rechazó el envío",
    });

    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al enviar email: Resend rechazó el envío");
    expect(mockInvitationLogInsert).not.toHaveBeenCalled();
  });

  /* ---- invitation_log ---- */

  it("registers the send in invitation_log with the caller and target ids", async () => {
    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(200);
    expect(mockInvitationLogInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        sent_by: "caller-id",
        email: "alumno@test.com",
      }),
    );
  });

  it("still returns success:true when the invitation_log insert fails", async () => {
    mockInvitationLogInsert.mockResolvedValue({
      error: { message: "constraint violation" },
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = (await POST(makeRequest({ userId: USER_ID })))!;
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "invitation_log insert failed:",
      { message: "constraint violation" },
    );

    consoleErrorSpy.mockRestore();
  });
});
