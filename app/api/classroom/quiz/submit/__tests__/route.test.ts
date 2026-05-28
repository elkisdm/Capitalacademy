import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockEnrollmentQuery = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "enrollments") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    single: mockEnrollmentQuery,
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

const mockConfigQuery = vi.fn();
const mockAttemptsQuery = vi.fn();
const mockQuestionsQuery = vi.fn();
const mockAttemptUpdate = vi.fn();
const mockAttemptInsert = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "quiz_configs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: mockConfigQuery,
              }),
            }),
          }),
        };
      }
      if (table === "quiz_attempts") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: mockAttemptsQuery,
              }),
            }),
          }),
          update: () => ({
            eq: mockAttemptUpdate,
          }),
          insert: () => ({
            select: () => ({
              single: mockAttemptInsert,
            }),
          }),
        };
      }
      if (table === "quiz_questions") {
        return {
          select: () => ({
            in: mockQuestionsQuery,
          }),
        };
      }
      return {};
    },
  })),
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
const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("POST /api/classroom/quiz/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "student-1" } } });
    mockEnrollmentQuery.mockResolvedValue({
      data: { id: "enr-1", status: "active" },
      error: null,
    });
    mockConfigQuery.mockResolvedValue({
      data: { max_attempts: 3, passing_grade_pct: 70 },
    });
    mockAttemptsQuery.mockResolvedValue({ data: [] });
    mockAttemptInsert.mockResolvedValue({
      data: { id: "attempt-new" },
      error: null,
    });
  });

  // --- Auth ---
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ programId: PROGRAM_ID, answers: { [Q1]: "A" } }));
    expect(res.status).toBe(401);
  });

  // --- Zod validation ---
  it("returns 422 when programId is missing", async () => {
    const res = await POST(makeRequest({ answers: { [Q1]: "A" } }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
  });

  it("returns 422 when answers is empty", async () => {
    const res = await POST(makeRequest({ programId: PROGRAM_ID, answers: {} }));
    expect(res.status).toBe(422);
  });

  it("returns 422 when answer value is invalid", async () => {
    const res = await POST(
      makeRequest({ programId: PROGRAM_ID, answers: { [Q1]: "X" } }),
    );
    expect(res.status).toBe(422);
  });

  // --- Enrollment ---
  it("returns 403 when no active enrollment", async () => {
    mockEnrollmentQuery.mockResolvedValue({ data: null, error: { message: "not found" } });
    const res = await POST(
      makeRequest({ programId: PROGRAM_ID, answers: { [Q1]: "A" } }),
    );
    expect(res.status).toBe(403);
  });

  // --- Config ---
  it("returns 404 when no quiz config", async () => {
    mockConfigQuery.mockResolvedValue({ data: null });
    const res = await POST(
      makeRequest({ programId: PROGRAM_ID, answers: { [Q1]: "A" } }),
    );
    expect(res.status).toBe(404);
  });

  // --- Already passed ---
  it("returns 409 when student already passed", async () => {
    mockAttemptsQuery.mockResolvedValue({
      data: [{ id: "a1", passed: true, completed_at: "2026-01-01" }],
    });
    const res = await POST(
      makeRequest({ programId: PROGRAM_ID, answers: { [Q1]: "A" } }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("aprobaste");
  });

  // --- Max attempts ---
  it("returns 409 when max attempts reached", async () => {
    mockAttemptsQuery.mockResolvedValue({
      data: [
        { id: "a1", passed: false, completed_at: "2026-01-01" },
        { id: "a2", passed: false, completed_at: "2026-01-02" },
        { id: "a3", passed: false, completed_at: "2026-01-03" },
      ],
    });
    const res = await POST(
      makeRequest({ programId: PROGRAM_ID, answers: { [Q1]: "A" } }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("maximo de intentos");
  });

  // --- Scoring: fail ---
  it("scores correctly and returns fail when below passing grade", async () => {
    mockQuestionsQuery.mockResolvedValue({
      data: [
        { id: Q1, correct_option: "A", explanation: null },
        { id: Q2, correct_option: "B", explanation: null },
        { id: Q3, correct_option: "C", explanation: "Explicación" },
      ],
      error: null,
    });

    const res = await POST(
      makeRequest({
        programId: PROGRAM_ID,
        answers: { [Q1]: "A", [Q2]: "D", [Q3]: "D" },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.score_pct).toBe(33);
    expect(json.passed).toBe(false);
    expect(json.correctCount).toBe(1);
    expect(json.totalQuestions).toBe(3);
    expect(json.certificate).toBeNull();
    expect(json.attemptsRemaining).toBe(2);
    expect(mockIssueCertificate).not.toHaveBeenCalled();
  });

  // --- Scoring: pass with certificate ---
  it("scores correctly, passes, and triggers certificate", async () => {
    mockQuestionsQuery.mockResolvedValue({
      data: [
        { id: Q1, correct_option: "A", explanation: null },
        { id: Q2, correct_option: "B", explanation: null },
        { id: Q3, correct_option: "C", explanation: null },
      ],
      error: null,
    });
    mockIssueCertificate.mockResolvedValue({
      certificateId: "cert-1",
      verificationCode: "ABCD1234",
      pdfUrl: "https://example.com/cert.pdf",
    });

    const res = await POST(
      makeRequest({
        programId: PROGRAM_ID,
        answers: { [Q1]: "A", [Q2]: "B", [Q3]: "C" },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.score_pct).toBe(100);
    expect(json.passed).toBe(true);
    expect(json.certificate).toEqual({
      verificationCode: "ABCD1234",
      pdfUrl: "https://example.com/cert.pdf",
    });
    expect(mockIssueCertificate).toHaveBeenCalledWith("enr-1", "attempt-new");
  });

  // --- Certificate generation error ---
  it("returns result with certificateError when issueCertificate fails", async () => {
    mockQuestionsQuery.mockResolvedValue({
      data: [{ id: Q1, correct_option: "A", explanation: null }],
      error: null,
    });
    mockIssueCertificate.mockRejectedValue(new Error("PDF generation failed"));

    const res = await POST(
      makeRequest({
        programId: PROGRAM_ID,
        answers: { [Q1]: "A" },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.passed).toBe(true);
    expect(json.certificate).toBeNull();
    expect(json.certificateError).toBe("PDF generation failed");
  });

  // --- Questions not found ---
  it("returns 422 when submitted questions don't exist in DB", async () => {
    mockQuestionsQuery.mockResolvedValue({
      data: [{ id: Q1, correct_option: "A", explanation: null }],
      error: null,
    });

    const res = await POST(
      makeRequest({
        programId: PROGRAM_ID,
        answers: { [Q1]: "A", [Q2]: "B" },
      }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain("no existen");
  });
});
