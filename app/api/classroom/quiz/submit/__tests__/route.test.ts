import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockGetUser = vi.fn();
const mockEnrollmentQuery = vi.fn();

// supabase server: solo se usa para auth + enrollment (status='active').
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "enrollments") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({ limit: () => ({ single: mockEnrollmentQuery }) }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  })),
}));

// Estado configurable por test; el builder genérico del admin client lo lee.
type State = {
  config: Record<string, unknown> | null;
  attemptById: Record<string, unknown> | null;
  priorPassed: Record<string, unknown> | null;
  questions: Array<Record<string, unknown>> | null;
  questionsError: unknown;
  updatedRows: Array<Record<string, unknown>> | null;
  updateError: unknown;
  completedAfter: Array<Record<string, unknown>>;
};
let state: State;

function makeBuilder(table: string) {
  const ops: Array<[string, unknown[]]> = [];
  const chain = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "in",
    "is",
    "not",
    "order",
    "limit",
  ];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = (...args: unknown[]) => {
      ops.push([m, args]);
      return builder;
    };
  }
  const resolve = (terminal: "single" | "maybeSingle" | "await") => {
    if (table === "evaluations") return { data: state.config, error: state.config ? null : {} };
    if (table === "quiz_questions") return { data: state.questions, error: state.questionsError };
    if (table === "quiz_attempts") {
      const has = (m: string, a0?: unknown) =>
        ops.some(([mm, args]) => mm === m && (a0 === undefined || args[0] === a0));
      if (has("update")) return { data: state.updatedRows, error: state.updateError };
      if (has("not")) return { data: state.completedAfter, error: null };
      if (has("eq", "passed")) return { data: state.priorPassed, error: null };
      if (has("eq", "id") && terminal === "single")
        return { data: state.attemptById, error: state.attemptById ? null : {} };
      return { data: [], error: null };
    }
    return { data: null, error: null };
  };
  builder.single = () => Promise.resolve(resolve("single"));
  builder.maybeSingle = () => Promise.resolve(resolve("maybeSingle"));
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve("await")).then(res, rej);
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeBuilder(table) })),
}));

const mockIssueCertificate = vi.fn();
vi.mock("@/lib/certificates/issue-certificate", () => ({
  issueCertificate: (...args: unknown[]) => mockIssueCertificate(...args),
}));

const { POST } = await import("@/app/api/classroom/quiz/submit/route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/classroom/quiz/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const Q1 = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const Q2 = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";
const Q3 = "aaaaaaaa-bbbb-4ccc-8ddd-333333333333";
const FOREIGN = "aaaaaaaa-bbbb-4ccc-8ddd-999999999999";
const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ATTEMPT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-aaaaaaaaaaaa";

describe("POST /api/classroom/quiz/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "student-1" } } });
    mockEnrollmentQuery.mockResolvedValue({ data: { id: "enr-1", status: "active" }, error: null });
    state = {
      config: { max_attempts: 1, passing_grade_pct: 70, questions_per_attempt: 3 },
      attemptById: {
        id: ATTEMPT_ID,
        enrollment_id: "enr-1",
        program_id: PROGRAM_ID,
        questions_presented: [Q1, Q2, Q3],
        completed_at: null,
      },
      priorPassed: null,
      questions: [
        { id: Q1, correct_option: "A", explanation: null },
        { id: Q2, correct_option: "B", explanation: null },
        { id: Q3, correct_option: "C", explanation: "Explicación" },
      ],
      questionsError: null,
      updatedRows: [{ id: ATTEMPT_ID }],
      updateError: null,
      completedAfter: [{ id: ATTEMPT_ID }],
    };
  });

  const validBody = (answers: Record<string, string>) => ({
    programId: PROGRAM_ID,
    attemptId: ATTEMPT_ID,
    answers,
  });

  // --- Auth / validación ---
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(401);
  });

  it("returns 422 when attemptId is missing", async () => {
    const res = await POST(makeRequest({ programId: PROGRAM_ID, answers: { [Q1]: "A" } }));
    expect(res.status).toBe(422);
  });

  it("returns 403 when no active enrollment", async () => {
    mockEnrollmentQuery.mockResolvedValue({ data: null, error: { message: "x" } });
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(403);
  });

  // --- BYPASS CERRADO: no se puede puntuar sin un intento real ---
  it("returns 404 when the attempt does not exist / is not owned", async () => {
    state.attemptById = null;
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(404);
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  it("returns 404 when the attempt belongs to another enrollment", async () => {
    state.attemptById = {
      id: ATTEMPT_ID,
      enrollment_id: "OTHER-enr",
      program_id: PROGRAM_ID,
      questions_presented: [Q1, Q2, Q3],
      completed_at: null,
    };
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(404);
  });

  it("returns 409 when the attempt was already completed", async () => {
    state.attemptById = { ...(state.attemptById as object), completed_at: "2026-01-01" };
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(409);
  });

  it("returns 409 when the student already passed", async () => {
    state.priorPassed = { id: "a-old" };
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(409);
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  // --- BYPASS CERRADO: no se puede inyectar una pregunta fuera del intento ---
  it("returns 409 when answers reference a question outside the presented set", async () => {
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [FOREIGN]: "A" })));
    expect(res.status).toBe(409);
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  // --- BYPASS CERRADO: el total lo fija el servidor (questions_presented), no el cliente ---
  it("scores over the PRESENTED set, not over what the client sends", async () => {
    // El cliente manda 1 sola respuesta correcta intentando sacar 100%.
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(200);
    const json = await res.json();
    // total = 3 (presentadas), no 1. 1/3 → 33%, NO 100%.
    expect(json.totalQuestions).toBe(3);
    expect(json.correctCount).toBe(1);
    expect(json.score_pct).toBe(33);
    expect(json.passed).toBe(false);
    expect(json.certificate).toBeNull();
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  // --- Aprobar emite certificado ---
  it("passes and issues certificate when all presented answers are correct", async () => {
    mockIssueCertificate.mockResolvedValue({
      verificationCode: "ABCD1234",
      pdfUrl: "https://example.com/cert.pdf",
    });
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [Q2]: "B", [Q3]: "C" })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.score_pct).toBe(100);
    expect(json.passed).toBe(true);
    expect(json.certificate).toEqual({
      verificationCode: "ABCD1234",
      pdfUrl: "https://example.com/cert.pdf",
    });
    expect(mockIssueCertificate).toHaveBeenCalledWith("enr-1", ATTEMPT_ID);
  });

  it("returns certificateError when issueCertificate fails", async () => {
    mockIssueCertificate.mockRejectedValue(new Error("PDF generation failed"));
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [Q2]: "B", [Q3]: "C" })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.passed).toBe(true);
    expect(json.certificate).toBeNull();
    expect(json.certificateError).toBe("PDF generation failed");
  });

  // --- Race anti doble-submit: si el UPDATE atómico no afecta filas → 409 ---
  it("returns 409 when the atomic close affected no rows (concurrent submit)", async () => {
    state.updatedRows = [];
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [Q2]: "B", [Q3]: "C" })));
    expect(res.status).toBe(409);
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });
});
