import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetUser = vi.fn();

type State = {
  enrollment: Record<string, unknown> | null;
  enrollmentError: Record<string, unknown> | null;
  existingCert: Record<string, unknown> | null;
  finalEval: Record<string, unknown> | null;
  passedAttempt: Record<string, unknown> | null;
};
let state: State;

// Builder genérico encadenable: registra las llamadas y resuelve según la
// tabla + el terminal invocado (single/maybeSingle), leyendo de `state`.
function makeServerBuilder(table: string) {
  const chain = ["select", "eq", "insert", "update", "limit"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = () => builder;
  }
  builder.single = () => Promise.resolve({ data: null, error: {} });
  builder.maybeSingle = () => {
    if (table === "enrollments")
      return Promise.resolve({ data: state.enrollment, error: state.enrollmentError });
    if (table === "certificates") return Promise.resolve({ data: state.existingCert, error: null });
    if (table === "quiz_attempts") return Promise.resolve({ data: state.passedAttempt, error: null });
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

function makeAdminBuilder(table: string) {
  const chain = ["select", "eq"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = () => builder;
  }
  builder.maybeSingle = () => {
    if (table === "evaluations") return Promise.resolve({ data: state.finalEval, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeAdminBuilder(table) })),
}));

const mockIssueCertificate = vi.fn();
vi.mock("@/lib/certificates/issue-certificate", () => ({
  issueCertificate: (...args: unknown[]) => mockIssueCertificate(...args),
}));

const { POST } = await import("@/app/api/classroom/certificate/retry/route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/classroom/certificate/retry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EVAL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const ATTEMPT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";

describe("POST /api/classroom/certificate/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "student-1" } } });
    state = {
      enrollment: {
        id: "enr-1",
        cohort_id: "cohort-1",
        cohorts: { program_id: PROGRAM_ID },
      },
      enrollmentError: null,
      existingCert: null,
      finalEval: { id: EVAL_ID },
      passedAttempt: { id: ATTEMPT_ID },
    };
  });

  it("responde 401 si no hay usuario autenticado", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest({ programId: PROGRAM_ID }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "No autenticado" });
  });

  it("responde 400 si el body no es JSON válido", async () => {
    const req = new Request("http://localhost/api/classroom/certificate/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "no-es-json",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Body inválido" });
  });

  it("responde 422 si falta programId", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "programId es requerido" });
  });

  it("responde 403 si no hay matrícula activa", async () => {
    state.enrollment = null;

    const res = await POST(makeRequest({ programId: PROGRAM_ID }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "No tienes matrícula activa" });
  });

  it("responde 500 si falla la verificación de matrícula", async () => {
    state.enrollmentError = { message: "timeout" };

    const res = await POST(makeRequest({ programId: PROGRAM_ID }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "No se pudo verificar tu matrícula" });
  });

  it("responde 409 si ya existe un certificado emitido", async () => {
    state.existingCert = { id: "cert-1" };

    const res = await POST(makeRequest({ programId: PROGRAM_ID }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Ya tienes un certificado emitido" });
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  it("responde 422 si el programa no tiene examen final configurado", async () => {
    state.finalEval = null;

    const res = await POST(makeRequest({ programId: PROGRAM_ID }));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Este programa no tiene un examen final configurado",
    });
  });

  it("responde 422 si no hay un intento aprobado del examen final", async () => {
    state.passedAttempt = null;

    const res = await POST(makeRequest({ programId: PROGRAM_ID }));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "No has aprobado el examen final" });
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  it("emite el certificado y responde 201 con verificationCode y pdfUrl", async () => {
    mockIssueCertificate.mockResolvedValue({
      certificateId: "cert-9",
      verificationCode: "ABC12345",
      pdfUrl: "https://example.com/cert.pdf",
    });

    const res = await POST(makeRequest({ programId: PROGRAM_ID }));

    expect(mockIssueCertificate).toHaveBeenCalledWith("enr-1", ATTEMPT_ID);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      verificationCode: "ABC12345",
      pdfUrl: "https://example.com/cert.pdf",
    });
  });

  it("responde 500 con mensaje genérico (sin filtrar detalles) si issueCertificate lanza un Error", async () => {
    mockIssueCertificate.mockRejectedValue(new Error("Plantilla de certificado no encontrada"));

    const res = await POST(makeRequest({ programId: PROGRAM_ID }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "No se pudo emitir el certificado. Intenta más tarde.",
    });
  });

  it("responde 500 con mensaje genérico si issueCertificate lanza algo que no es Error", async () => {
    mockIssueCertificate.mockRejectedValue("fallo desconocido");

    const res = await POST(makeRequest({ programId: PROGRAM_ID }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "No se pudo emitir el certificado. Intenta más tarde.",
    });
  });
});
