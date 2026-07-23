import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Controllable mock fns
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();
const mockVerifyEnrollment = vi.fn();
const mockSummarySingle = vi.fn();

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest)
// ---------------------------------------------------------------------------
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "lesson_summaries") {
        return {
          select: (..._args: unknown[]) => ({
            eq: (..._a: unknown[]) => ({
              single: mockSummarySingle,
            }),
          }),
        };
      }
      return {};
    },
  })),
}));

vi.mock("@/lib/classroom/verify-enrollment", () => ({
  verifyEnrollment: (...args: unknown[]) => mockVerifyEnrollment(...args),
}));

// ---------------------------------------------------------------------------
// Import handler AFTER mocks are wired
// ---------------------------------------------------------------------------
const { GET } = await import("@/app/api/classroom/summary/route");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const LESSON_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ENROLLMENT_ID = "11111111-2222-4333-8444-555555555555";
const USER = { id: "00000000-1111-4222-8333-444444444444" };

function makeRequest(query?: string) {
  const url = query
    ? `http://localhost/api/classroom/summary?${query}`
    : "http://localhost/api/classroom/summary";
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/classroom/summary
// ===========================================================================
describe("GET /api/classroom/summary", () => {
  // ---- auth ------------------------------------------------------------------
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await GET(makeRequest(`lessonId=${LESSON_ID}`));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
    expect(mockVerifyEnrollment).not.toHaveBeenCalled();
  });

  // ---- validation --------------------------------------------------------------
  it("returns 422 when lessonId is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });

    const res = await GET(makeRequest());

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("lessonId es requerido");
    expect(mockVerifyEnrollment).not.toHaveBeenCalled();
  });

  // ---- enrollment ---------------------------------------------------------------
  it("returns 403 when the lesson doesn't exist or the user has no active enrollment", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockVerifyEnrollment.mockResolvedValue(null);

    const res = await GET(makeRequest(`lessonId=${LESSON_ID}`));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("matrícula");
    expect(mockVerifyEnrollment).toHaveBeenCalledWith(USER.id, LESSON_ID);
    expect(mockSummarySingle).not.toHaveBeenCalled();
  });

  // ---- provider error -------------------------------------------------------------
  it("returns 404 when the query against lesson_summaries fails", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockVerifyEnrollment.mockResolvedValue(ENROLLMENT_ID);
    mockSummarySingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "no rows" },
    });

    const res = await GET(makeRequest(`lessonId=${LESSON_ID}`));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resumen no disponible para esta leccion");
  });

  // ---- missing data without an explicit error ------------------------------------
  it("returns 404 when there's no error but the summary is empty", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockVerifyEnrollment.mockResolvedValue(ENROLLMENT_ID);
    mockSummarySingle.mockResolvedValue({ data: null, error: null });

    const res = await GET(makeRequest(`lessonId=${LESSON_ID}`));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Resumen no disponible para esta leccion");
  });

  // ---- success --------------------------------------------------------------------
  it("returns the summary data with a private cache header on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockVerifyEnrollment.mockResolvedValue(ENROLLMENT_ID);

    const summaryRow = {
      lesson_id: LESSON_ID,
      key_points: ["punto 1", "punto 2"],
      summary_text: "Resumen de la clase",
      glossary: [{ term: "RUT", definition: "Rol Único Tributario" }],
      generated_at: "2026-07-01T00:00:00.000Z",
    };
    mockSummarySingle.mockResolvedValue({ data: summaryRow, error: null });

    const res = await GET(makeRequest(`lessonId=${LESSON_ID}`));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(summaryRow);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(mockVerifyEnrollment).toHaveBeenCalledWith(USER.id, LESSON_ID);
  });
});
