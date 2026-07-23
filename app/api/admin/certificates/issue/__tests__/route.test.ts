import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockAuthorizeAdmin = vi.fn();

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: (...args: unknown[]) => mockAuthorizeAdmin(...args),
}));

const mockIssueCertificate = vi.fn();

vi.mock("@/lib/certificates/issue-certificate", () => ({
  issueCertificate: (...args: unknown[]) => mockIssueCertificate(...args),
}));

const mockMaybeSingle = vi.fn();
const mockCreateAdminClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

/* ------------------------------------------------------------------ */
/*  Import route AFTER mocks are registered                            */
/* ------------------------------------------------------------------ */

const { POST } = await import("@/app/api/admin/certificates/issue/route");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/certificates/issue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonRequest() {
  return new Request("http://localhost/api/admin/certificates/issue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{esto no es json",
  });
}

const ENROLLMENT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("POST /api/admin/certificates/issue", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthorizeAdmin.mockResolvedValue({
      user: { id: "caller-id", email: "admin@test.com" },
    });

    mockIssueCertificate.mockResolvedValue({
      certificateId: "cert-1",
      verificationCode: "ABC12345",
      pdfUrl: "https://storage.test/cert-1.pdf",
    });

    mockMaybeSingle.mockResolvedValue({ data: null });
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      }),
    });
  });

  /* ---- Auth ---- */

  it("returns 401 when authorizeAdmin rejects (unauthenticated)", async () => {
    mockAuthorizeAdmin.mockResolvedValue({
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    });

    const res = (await POST(makeRequest({ enrollmentId: ENROLLMENT_ID })))!;
    expect(res.status).toBe(401);
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  it("returns 403 when authorizeAdmin rejects (unauthorized role)", async () => {
    mockAuthorizeAdmin.mockResolvedValue({
      error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    });

    const res = (await POST(makeRequest({ enrollmentId: ENROLLMENT_ID })))!;
    expect(res.status).toBe(403);
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  /* ---- Body inválido ---- */

  it("returns 400 when the JSON body cannot be parsed", async () => {
    const res = (await POST(makeInvalidJsonRequest()))!;
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Body invalido");
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  /* ---- Validación de enrollmentId ---- */

  it("returns 422 when enrollmentId is missing", async () => {
    const res = (await POST(makeRequest({})))!;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("enrollmentId es requerido y debe ser un UUID válido");
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  it("returns 422 when enrollmentId is an empty string", async () => {
    const res = (await POST(makeRequest({ enrollmentId: "" })))!;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("enrollmentId es requerido y debe ser un UUID válido");
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  it("returns 422 when enrollmentId is not a valid UUID", async () => {
    const res = (await POST(makeRequest({ enrollmentId: "abc123-def456" })))!;
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("enrollmentId es requerido y debe ser un UUID válido");
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  /* ---- Certificado ya emitido ---- */

  it("returns 409 when the enrollment already has a certificate", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "cert-existente" } });

    const res = (await POST(makeRequest({ enrollmentId: ENROLLMENT_ID })))!;
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("Esta matrícula ya tiene un certificado emitido");
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  /* ---- Camino feliz ---- */

  it("issues the certificate and returns 201 with certificate data", async () => {
    const res = (await POST(makeRequest({ enrollmentId: ENROLLMENT_ID })))!;
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.certificate).toEqual({
      id: "cert-1",
      verificationCode: "ABC12345",
      pdfUrl: "https://storage.test/cert-1.pdf",
    });
    expect(mockIssueCertificate).toHaveBeenCalledWith(ENROLLMENT_ID);
  });

  /* ---- Error del proveedor (issueCertificate) ---- */

  it("returns 500 with the underlying message when issueCertificate throws an Error", async () => {
    mockIssueCertificate.mockRejectedValue(
      new Error("No active certificate template for program: prog-1"),
    );
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = (await POST(makeRequest({ enrollmentId: ENROLLMENT_ID })))!;
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe(
      "Error al emitir certificado: No active certificate template for program: prog-1",
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error issuing certificate:",
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it("returns 500 with a generic message when issueCertificate throws a non-Error value", async () => {
    mockIssueCertificate.mockRejectedValue("fallo desconocido");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = (await POST(makeRequest({ enrollmentId: ENROLLMENT_ID })))!;
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Error al emitir certificado: Error desconocido");

    consoleErrorSpy.mockRestore();
  });
});
