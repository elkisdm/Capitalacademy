import { describe, it, expect, vi, beforeEach } from "vitest";

// GET /api/classroom/quiz — estado del quiz final para el alumno (gating).
// Mockeamos solo los bordes: Supabase (server + admin) y getCompletion
// (ya cubierto en lib/classroom/__tests__/quiz-runtime.test.ts). isEvaluationOpen
// es una función pura y se ejerce con datos reales, no se mockea.

const mockGetUser = vi.fn();
const mockEnrollmentQuery = vi.fn();
const mockGetCompletion = vi.fn();

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

type State = {
  config: Record<string, unknown> | null;
  attempts: Array<Record<string, unknown>>;
};
let state: State;

function makeAdminBuilder(table: string) {
  const chain = ["select", "eq", "order", "limit", "in"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = () => builder;
  }
  const resolve = () => {
    if (table === "evaluations") {
      return { data: state.config, error: state.config ? null : { message: "not found" } };
    }
    if (table === "quiz_attempts") {
      return { data: state.attempts, error: null };
    }
    return { data: null, error: null };
  };
  builder.single = () => Promise.resolve(resolve());
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => makeAdminBuilder(table),
  })),
}));

vi.mock("@/lib/classroom/quiz-runtime", () => ({
  getCompletion: (...args: unknown[]) => mockGetCompletion(...args),
}));

const { GET } = await import("@/app/api/classroom/quiz/route");

const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function makeRequest(programId?: string) {
  const url = new URL("http://localhost/api/classroom/quiz");
  if (programId !== undefined) url.searchParams.set("programId", programId);
  return new Request(url);
}

describe("GET /api/classroom/quiz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "student-1" } } });
    mockEnrollmentQuery.mockResolvedValue({ data: { id: "enr-1", status: "active" }, error: null });
    mockGetCompletion.mockResolvedValue({ currentPct: 100, completedLessons: 10, totalLessons: 10 });
    state = {
      config: {
        id: "final-eval-1",
        max_attempts: 3,
        passing_grade_pct: 70,
        questions_per_attempt: 5,
        min_completion_pct: 50,
        time_limit_minutes: null,
        is_active: true,
        opens_at: null,
        closes_at: null,
      },
      attempts: [],
    };
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest(PROGRAM_ID));
    expect(res.status).toBe(401);
  });

  it("returns 422 when programId is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toMatch(/programId/);
  });

  it("returns 403 when there is no active enrollment", async () => {
    mockEnrollmentQuery.mockResolvedValue({ data: null, error: { message: "no rows" } });
    const res = await GET(makeRequest(PROGRAM_ID));
    expect(res.status).toBe(403);
  });

  it("returns status unconfigured when the evaluation query errors", async () => {
    state.config = null; // resolve() produce error truthy cuando config es null
    const res = await GET(makeRequest(PROGRAM_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ status: "unconfigured" });
  });

  it("returns status unconfigured when the final quiz is outside its window (draft)", async () => {
    state.config = { ...state.config, is_active: false };
    const res = await GET(makeRequest(PROGRAM_ID));
    const json = await res.json();
    expect(json).toEqual({ status: "unconfigured" });
  });

  it("returns status unconfigured when the final quiz is scheduled (opens_at en el futuro)", async () => {
    state.config = { ...state.config, opens_at: "2099-01-01T00:00:00Z" };
    const res = await GET(makeRequest(PROGRAM_ID));
    const json = await res.json();
    expect(json).toEqual({ status: "unconfigured" });
  });

  it("returns status passed with attemptsUsed and lastScore when the student already passed", async () => {
    state.attempts = [
      { id: "a2", passed: true, score_pct: 90, completed_at: "2026-02-01" },
      { id: "a1", passed: false, score_pct: 40, completed_at: "2026-01-01" },
    ];
    const res = await GET(makeRequest(PROGRAM_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ status: "passed", attemptsUsed: 2, lastScore: 90 });
  });

  it("returns status locked_completion when there is no in-progress attempt and completion is below the gate", async () => {
    mockGetCompletion.mockResolvedValue({ currentPct: 10, completedLessons: 1, totalLessons: 10 });
    const res = await GET(makeRequest(PROGRAM_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      status: "locked_completion",
      currentPct: 10,
      requiredPct: 50,
      completedLessons: 1,
      totalLessons: 10,
    });
  });

  it("uses 0 as the default completion gate when min_completion_pct is null", async () => {
    state.config = { ...state.config, min_completion_pct: null };
    mockGetCompletion.mockResolvedValue({ currentPct: 0, completedLessons: 0, totalLessons: 10 });
    const res = await GET(makeRequest(PROGRAM_ID));
    const json = await res.json();
    // 0% actual >= 0% requerido: no bloquea por completitud, sigue a "ready".
    expect(json.status).toBe("ready");
  });

  it("returns status locked_attempts when there is no in-progress attempt and max_attempts is reached", async () => {
    state.attempts = [
      { id: "a1", passed: false, score_pct: 40, completed_at: "2026-01-01" },
      { id: "a2", passed: false, score_pct: 50, completed_at: "2026-01-02" },
      { id: "a3", passed: false, score_pct: 60, completed_at: "2026-01-03" },
    ];
    const res = await GET(makeRequest(PROGRAM_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ status: "locked_attempts", attemptsUsed: 3, maxAttempts: 3 });
  });

  it("returns status ready with the shaped config and lastScore undefined when there are no completed attempts", async () => {
    const res = await GET(makeRequest(PROGRAM_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      status: "ready",
      hasInProgress: false,
      attemptsUsed: 0,
      attemptsRemaining: 3,
      lastScore: undefined,
      config: {
        questionsPerAttempt: 5,
        passingGradePct: 70,
        maxAttempts: 3,
        timeLimitMinutes: null,
      },
    });
  });

  it("stays ready and skips both locks when there is an in-progress attempt, even below the completion gate and at max attempts", async () => {
    mockGetCompletion.mockResolvedValue({ currentPct: 0, completedLessons: 0, totalLessons: 10 });
    state.attempts = [
      { id: "a1", passed: false, score_pct: 40, completed_at: "2026-01-01" },
      { id: "a2", passed: false, score_pct: 50, completed_at: "2026-01-02" },
      { id: "a3", passed: false, score_pct: 60, completed_at: "2026-01-03" },
      { id: "a-open", passed: null, score_pct: null, completed_at: null },
    ];
    const res = await GET(makeRequest(PROGRAM_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ready");
    expect(json.hasInProgress).toBe(true);
    expect(json.attemptsUsed).toBe(3);
    expect(json.attemptsRemaining).toBe(0);
  });
});
