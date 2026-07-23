import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetUser = vi.fn();

type State = {
  enrollment: Record<string, unknown> | null;
  certificate: Record<string, unknown> | null;
  certificateError: Record<string, unknown> | null;
};
let state: State;

// Builder encadenable genérico: registra el `table` invocado y resuelve
// según `state` al llegar al terminal `.single()`.
function makeServerBuilder(table: string) {
  const chain = ["select", "eq", "limit"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = () => builder;
  }
  builder.single = () => {
    if (table === "enrollments")
      return Promise.resolve({ data: state.enrollment, error: null });
    if (table === "certificates")
      return Promise.resolve({ data: state.certificate, error: state.certificateError });
    return Promise.resolve({ data: null, error: null });
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => makeServerBuilder(table),
  })),
}));

const mockGetCertificateSignedUrl = vi.fn();
vi.mock("@/lib/certificates/get-certificate-url", () => ({
  getCertificateSignedUrl: (...args: unknown[]) => mockGetCertificateSignedUrl(...args),
}));

const { GET } = await import("@/app/api/classroom/certificate/route");

function makeRequest(programId?: string) {
  const url = programId
    ? `http://localhost/api/classroom/certificate?programId=${programId}`
    : "http://localhost/api/classroom/certificate";
  return new Request(url);
}

const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("GET /api/classroom/certificate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "student-1" } } });
    mockGetCertificateSignedUrl.mockResolvedValue("https://example.com/signed.pdf");
    state = {
      enrollment: { id: "enr-1", cohorts: { program_id: PROGRAM_ID } },
      certificate: {
        id: "cert-1",
        verification_code: "ABC12345",
        pdf_storage_path: "certs/cert-1.pdf",
        student_name: "Estudiante Prueba",
        issued_at: "2026-01-01T00:00:00.000Z",
      },
      certificateError: null,
    };
  });

  it("responde 401 si no hay usuario autenticado", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await GET(makeRequest(PROGRAM_ID));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "No autenticado" });
  });

  it("responde 422 si falta el query param programId", async () => {
    const res = await GET(makeRequest());

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "programId es requerido" });
  });

  it("responde 404 si el usuario no tiene inscripción en el programa", async () => {
    state.enrollment = null;

    const res = await GET(makeRequest(PROGRAM_ID));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "No tienes inscripcion en este programa",
    });
    expect(mockGetCertificateSignedUrl).not.toHaveBeenCalled();
  });

  it("responde 404 si no existe certificado para la matrícula", async () => {
    state.certificate = null;

    const res = await GET(makeRequest(PROGRAM_ID));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Certificado no encontrado" });
    expect(mockGetCertificateSignedUrl).not.toHaveBeenCalled();
  });

  it("responde 404 si la consulta de certificado devuelve error", async () => {
    state.certificate = null;
    state.certificateError = { message: "db error" };

    const res = await GET(makeRequest(PROGRAM_ID));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Certificado no encontrado" });
  });

  it("responde 200 con el certificado y la pdf_url firmada", async () => {
    const res = await GET(makeRequest(PROGRAM_ID));

    expect(mockGetCertificateSignedUrl).toHaveBeenCalledWith("certs/cert-1.pdf");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "cert-1",
      verification_code: "ABC12345",
      pdf_storage_path: "certs/cert-1.pdf",
      student_name: "Estudiante Prueba",
      issued_at: "2026-01-01T00:00:00.000Z",
      pdf_url: "https://example.com/signed.pdf",
    });
  });

  it("responde 200 con pdf_url null si no se pudo generar la URL firmada", async () => {
    mockGetCertificateSignedUrl.mockResolvedValue(null);

    const res = await GET(makeRequest(PROGRAM_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pdf_url).toBeNull();
  });
});
