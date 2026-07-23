import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockAuthorizeAdmin = vi.fn();

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: (...args: unknown[]) => mockAuthorizeAdmin(...args),
}));

const mockCohortSingle = vi.fn();
const mockProfilesSelectIn = vi.fn();
const mockGenerateLink = vi.fn();
const mockProfilesUpsert = vi.fn();
const mockEnrollmentsUpsert = vi.fn();
const mockCohortRolesUpsert = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        generateLink: (...args: unknown[]) => mockGenerateLink(...args),
      },
    },
    from: (table: string) => {
      if (table === "cohorts") {
        return {
          select: () => ({
            eq: () => ({
              single: () => mockCohortSingle(),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            in: (...args: unknown[]) => mockProfilesSelectIn(...args),
          }),
          upsert: (...args: unknown[]) => mockProfilesUpsert(...args),
        };
      }
      if (table === "enrollments") {
        return {
          upsert: (...args: unknown[]) => mockEnrollmentsUpsert(...args),
        };
      }
      if (table === "cohort_roles") {
        return {
          upsert: (...args: unknown[]) => mockCohortRolesUpsert(...args),
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

const { POST } = await import("@/app/api/admin/users/bulk/route");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/users/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest() {
  return new Request("http://localhost/api/admin/users/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{esto no es json",
  });
}

const COHORT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("POST /api/admin/users/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthorizeAdmin.mockResolvedValue({
      user: { id: "caller-id", email: "admin@test.com" },
    });

    mockCohortSingle.mockResolvedValue({
      data: { name: "Cohorte A", programs: { name: "Programa X" } },
    });

    // Por defecto ningún email preexiste en `profiles`.
    mockProfilesSelectIn.mockResolvedValue({ data: [] });

    mockGenerateLink.mockResolvedValue({
      data: {
        user: { id: "new-user-id" },
        properties: {
          action_link: "https://capitalacademy.cl/invite/tok",
          hashed_token: "tok-hash",
          verification_type: "invite",
        },
      },
      error: null,
    });

    mockProfilesUpsert.mockResolvedValue({ error: null });
    mockEnrollmentsUpsert.mockResolvedValue({ error: null });
    mockCohortRolesUpsert.mockResolvedValue({ error: null });

    mockSendInvitationEmail.mockResolvedValue({ success: true });
  });

  /* ---- Auth ---- */

  it("returns 401 when authorizeAdmin rejects (unauthenticated)", async () => {
    mockAuthorizeAdmin.mockResolvedValue({
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    });

    const res = await POST(
      makeRequest({ rows: [{ email: "a@b.com", full_name: "A" }], cohort_id: COHORT_ID }),
    );
    expect(res!.status).toBe(401);
  });

  it("returns 403 when authorizeAdmin rejects (unauthorized role)", async () => {
    mockAuthorizeAdmin.mockResolvedValue({
      error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    });

    const res = await POST(
      makeRequest({ rows: [{ email: "a@b.com", full_name: "A" }], cohort_id: COHORT_ID }),
    );
    expect(res!.status).toBe(403);
  });

  /* ---- Body inválido ---- */

  it("returns 400 when the JSON body cannot be parsed", async () => {
    const res = await POST(makeInvalidJsonRequest());
    expect(res!.status).toBe(400);
    const json = await res!.json();
    expect(json.error).toBe("Body inválido");
  });

  /* ---- Validación de rows ---- */

  it("returns 422 when rows is missing", async () => {
    const res = await POST(makeRequest({ cohort_id: COHORT_ID }));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toContain("rows");
  });

  it("returns 422 when rows is not an array", async () => {
    const res = await POST(makeRequest({ rows: "no-array", cohort_id: COHORT_ID }));
    expect(res!.status).toBe(422);
  });

  it("returns 422 when rows is empty", async () => {
    const res = await POST(makeRequest({ rows: [], cohort_id: COHORT_ID }));
    expect(res!.status).toBe(422);
  });

  it("returns 422 when rows exceeds 50 entries", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      email: `user${i}@test.com`,
      full_name: `User ${i}`,
    }));
    const res = await POST(makeRequest({ rows, cohort_id: COHORT_ID }));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toContain("Máximo 50");
  });

  it("returns 422 when cohort_id is missing", async () => {
    const res = await POST(
      makeRequest({ rows: [{ email: "a@b.com", full_name: "A" }] }),
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toContain("cohort_id");
  });

  /* ---- Cohorte ---- */

  it("returns 404 when the cohort does not exist", async () => {
    mockCohortSingle.mockResolvedValue({ data: null });

    const res = await POST(
      makeRequest({
        rows: [{ email: "a@b.com", full_name: "A" }],
        cohort_id: COHORT_ID,
      }),
    );
    expect(res!.status).toBe(404);
    const json = await res!.json();
    expect(json.error).toBe("Cohorte no encontrada");
  });

  it("falls back to 'Capital Academy' as programName when programs relation is null", async () => {
    mockCohortSingle.mockResolvedValue({
      data: { name: "Cohorte Sin Programa", programs: null },
    });

    const res = await POST(
      makeRequest({
        rows: [{ email: "nuevo@test.com", full_name: "Nuevo" }],
        cohort_id: COHORT_ID,
        send_invitations: true,
      }),
    );
    expect(res!.status).toBe(200);
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ programName: "Capital Academy" }),
    );
  });

  /* ---- Validación de filas individuales ---- */

  it("collects a row error when email or full_name is missing, without calling generateLink for it", async () => {
    const res = await POST(
      makeRequest({
        rows: [
          { email: "", full_name: "Sin email" },
          { email: "sinnombre@test.com", full_name: "" },
        ],
        cohort_id: COHORT_ID,
      }),
    );
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.errors).toHaveLength(2);
    expect(json.errors[0]).toEqual({
      row: 1,
      email: "",
      reason: "email y full_name son requeridos",
    });
    expect(json.errors[1]).toEqual({
      row: 2,
      email: "sinnombre@test.com",
      reason: "email y full_name son requeridos",
    });
    expect(json.created).toBe(0);
    expect(json.assigned).toBe(0);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  /* ---- Usuario ya existente ---- */

  it("skips generateLink and reuses the existing profile id when the email already exists", async () => {
    mockProfilesSelectIn.mockResolvedValue({
      data: [{ id: "existing-uid", email: "existe@test.com" }],
    });

    const res = await POST(
      makeRequest({
        rows: [{ email: "existe@test.com", full_name: "Ya Existe" }],
        cohort_id: COHORT_ID,
      }),
    );
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.created).toBe(0);
    expect(json.assigned).toBe(1);
    expect(json.errors).toHaveLength(0);
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mockProfilesUpsert).not.toHaveBeenCalled();
    expect(mockEnrollmentsUpsert).toHaveBeenCalledWith(
      [{ student_id: "existing-uid", cohort_id: COHORT_ID, status: "active" }],
      { onConflict: "student_id,cohort_id" },
    );
    expect(mockCohortRolesUpsert).toHaveBeenCalledWith(
      [
        {
          user_id: "existing-uid",
          cohort_id: COHORT_ID,
          role: "student",
          granted_by: "caller-id",
        },
      ],
      { onConflict: "user_id,cohort_id,role" },
    );
  });

  /* ---- Usuario nuevo: creación vía generateLink ---- */

  it("creates a new user via generateLink and upserts the profile", async () => {
    const res = await POST(
      makeRequest({
        rows: [{ email: "nuevo@test.com", full_name: "Nuevo Alumno", phone: "+56911111111" }],
        cohort_id: COHORT_ID,
        send_invitations: false,
      }),
    );
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.created).toBe(1);
    expect(json.assigned).toBe(1);
    expect(json.errors).toHaveLength(0);

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: "invite",
      email: "nuevo@test.com",
      options: { redirectTo: expect.stringContaining("/onboarding/set-password") },
    });
    expect(mockProfilesUpsert).toHaveBeenCalledWith([
      {
        id: "new-user-id",
        email: "nuevo@test.com",
        full_name: "Nuevo Alumno",
        phone: "+56911111111",
        system_role: "user",
      },
    ]);
    expect(mockSendInvitationEmail).not.toHaveBeenCalled();
  });

  it("defaults phone to null when the row does not provide one", async () => {
    await POST(
      makeRequest({
        rows: [{ email: "sinfono@test.com", full_name: "Sin Fono" }],
        cohort_id: COHORT_ID,
      }),
    );
    expect(mockProfilesUpsert).toHaveBeenCalledWith([
      expect.objectContaining({ phone: null }),
    ]);
  });

  it("sends the invitation email with the right cohort/program context when send_invitations is true", async () => {
    await POST(
      makeRequest({
        rows: [{ email: "invitado@test.com", full_name: "Invitado" }],
        cohort_id: COHORT_ID,
        send_invitations: true,
      }),
    );
    expect(mockSendInvitationEmail).toHaveBeenCalledWith({
      email: "invitado@test.com",
      fullName: "Invitado",
      inviteUrl:
        "https://capitalacademy.cl/auth/confirm?token_hash=tok-hash&type=invite&next=%2Fonboarding%2Fset-password",
      programName: "Programa X",
      cohortName: "Cohorte A",
    });
  });

  /* ---- generateLink falla ---- */

  it("collects a row error and skips the row when generateLink fails, without affecting other rows", async () => {
    mockGenerateLink
      .mockResolvedValueOnce({ data: null, error: { message: "Ya registrado" } })
      .mockResolvedValueOnce({
        data: {
          user: { id: "otro-uid" },
          properties: { action_link: "https://capitalacademy.cl/invite/otro" },
        },
        error: null,
      });

    const res = await POST(
      makeRequest({
        rows: [
          { email: "duplicado@test.com", full_name: "Duplicado" },
          { email: "ok@test.com", full_name: "OK" },
        ],
        cohort_id: COHORT_ID,
      }),
    );
    const json = await res!.json();
    expect(json.created).toBe(1);
    expect(json.assigned).toBe(1);
    expect(json.errors).toEqual([
      { row: 1, email: "duplicado@test.com", reason: "Ya registrado" },
    ]);
  });

  /* ---- Excepción inesperada durante el procesamiento de la fila ---- */

  it("catches a thrown Error during row processing and reports its message", async () => {
    mockGenerateLink.mockRejectedValue(new Error("Timeout de red"));

    const res = await POST(
      makeRequest({
        rows: [{ email: "explota@test.com", full_name: "Explota" }],
        cohort_id: COHORT_ID,
      }),
    );
    const json = await res!.json();
    expect(json.errors).toEqual([
      { row: 1, email: "explota@test.com", reason: "Timeout de red" },
    ]);
    expect(json.created).toBe(0);
  });

  it("falls back to 'Error desconocido' when a non-Error value is thrown", async () => {
    mockGenerateLink.mockRejectedValue("string-no-error");

    const res = await POST(
      makeRequest({
        rows: [{ email: "raro@test.com", full_name: "Raro" }],
        cohort_id: COHORT_ID,
      }),
    );
    const json = await res!.json();
    expect(json.errors).toEqual([
      { row: 1, email: "raro@test.com", reason: "Error desconocido" },
    ]);
  });

  /* ---- Falla el envío de sendInvitationEmail ---- */

  it("reports an error for the row when sendInvitationEmail fails, while still creating and assigning the user", async () => {
    mockSendInvitationEmail.mockResolvedValue({
      success: false,
      error: "Resend rechazó el envío",
    });

    const res = await POST(
      makeRequest({
        rows: [{ email: "correo-roto@test.com", full_name: "Correo Roto" }],
        cohort_id: COHORT_ID,
        send_invitations: true,
      }),
    );
    const json = await res!.json();
    expect(json.created).toBe(1);
    expect(json.assigned).toBe(1);
    expect(json.errors).toEqual([
      {
        row: 1,
        email: "correo-roto@test.com",
        reason: "Invitación no enviada: Resend rechazó el envío",
      },
    ]);
  });

  /* ---- Falla el upsert batch de profiles ---- */

  it("reports an error per new row and resets created to 0 when the profiles batch upsert fails, without touching existing users", async () => {
    mockProfilesSelectIn.mockResolvedValue({
      data: [{ id: "existing-uid", email: "existente@test.com" }],
    });
    mockProfilesUpsert.mockResolvedValue({
      error: { message: "constraint violation" },
    });

    const res = await POST(
      makeRequest({
        rows: [
          { email: "existente@test.com", full_name: "Existente" },
          { email: "nuevo2@test.com", full_name: "Nuevo Dos" },
        ],
        cohort_id: COHORT_ID,
      }),
    );
    const json = await res!.json();
    expect(json.created).toBe(0);
    expect(json.errors).toEqual([
      { row: 2, email: "nuevo2@test.com", reason: "Perfil: constraint violation" },
    ]);
    // El usuario existente no se ve afectado por la falla de upsert de perfiles.
    expect(json.assigned).toBe(1);
    expect(mockEnrollmentsUpsert).toHaveBeenCalledWith(
      [{ student_id: "existing-uid", cohort_id: COHORT_ID, status: "active" }],
      { onConflict: "student_id,cohort_id" },
    );
  });

  /* ---- Falla el upsert batch de enrollments ---- */

  it("returns assigned:0 and a row error per succeeded user when the enrollments upsert fails", async () => {
    mockEnrollmentsUpsert.mockResolvedValue({
      error: { message: "fk violation" },
    });

    const res = await POST(
      makeRequest({
        rows: [{ email: "nuevo3@test.com", full_name: "Nuevo Tres" }],
        cohort_id: COHORT_ID,
      }),
    );
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.assigned).toBe(0);
    expect(json.created).toBe(1);
    expect(json.errors).toEqual([
      { row: 1, email: "nuevo3@test.com", reason: "Enrollment: fk violation" },
    ]);
    expect(mockCohortRolesUpsert).not.toHaveBeenCalled();
  });

  /* ---- Falla el upsert batch de cohort_roles ---- */

  it("returns assigned:0 and a row error per succeeded user when the cohort_roles upsert fails", async () => {
    mockCohortRolesUpsert.mockResolvedValue({
      error: { message: "role conflict" },
    });

    const res = await POST(
      makeRequest({
        rows: [{ email: "nuevo4@test.com", full_name: "Nuevo Cuatro" }],
        cohort_id: COHORT_ID,
      }),
    );
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.assigned).toBe(0);
    expect(json.created).toBe(1);
    expect(json.errors).toEqual([
      { row: 1, email: "nuevo4@test.com", reason: "Rol: role conflict" },
    ]);
    expect(mockEnrollmentsUpsert).toHaveBeenCalledOnce();
  });

  /* ---- Camino feliz combinado ---- */

  it("handles a mixed batch (existing + new + invalid + failed) and returns aggregated counts", async () => {
    mockProfilesSelectIn.mockResolvedValue({
      data: [{ id: "existing-uid", email: "existente@test.com" }],
    });
    mockGenerateLink
      .mockResolvedValueOnce({
        data: {
          user: { id: "nuevo-uid-1" },
          properties: { action_link: "https://capitalacademy.cl/invite/1" },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "correo inválido" } });

    const res = await POST(
      makeRequest({
        rows: [
          { email: "existente@test.com", full_name: "Existente" },
          { email: "nuevo@test.com", full_name: "Nuevo" },
          { email: "malo@test.com", full_name: "Malo" },
          { email: "", full_name: "" },
        ],
        cohort_id: COHORT_ID,
        send_invitations: true,
      }),
    );
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.created).toBe(1);
    expect(json.assigned).toBe(2);
    expect(json.errors).toEqual([
      { row: 4, email: "", reason: "email y full_name son requeridos" },
      { row: 3, email: "malo@test.com", reason: "correo inválido" },
    ]);
    expect(mockSendInvitationEmail).toHaveBeenCalledOnce();
  });
});
