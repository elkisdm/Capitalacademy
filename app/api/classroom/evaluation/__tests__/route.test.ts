import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks — solo bordes externos: los dos clientes de Supabase.         */
/* resolveEvaluationAccess / toPublicConfig corren de verdad,          */
/* alimentados por estos mocks (no se stubean directo).                */
/* ------------------------------------------------------------------ */

const mockGetUser = vi.fn();

type State = {
  evaluationRow: Record<string, unknown> | null;
  enrollmentResult: { data: Record<string, unknown> | null; error: unknown };
  attempts: Array<Record<string, unknown>> | null;
  attemptsError: unknown;
};
let state: State;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "enrollments") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({
                  limit: () => ({ single: () => Promise.resolve(state.enrollmentResult) }),
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

function makeAdminBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = ["select", "eq", "order"];
  for (const m of chain) {
    builder[m] = () => builder;
  }
  builder.single = () => {
    if (table === "evaluations") {
      return Promise.resolve({
        data: state.evaluationRow,
        error: state.evaluationRow ? null : { message: "no encontrada" },
      });
    }
    return Promise.resolve({ data: null, error: null });
  };
  // La consulta de intentos termina en `.order(...)` sin `.single()`, por lo
  // que se resuelve como thenable (await directo del builder encadenado).
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
    const result =
      table === "quiz_attempts" ? { data: state.attempts, error: state.attemptsError ?? null } : { data: null, error: null };
    return Promise.resolve(result).then(resolve, reject);
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeAdminBuilder(table) })),
}));

const { GET } = await import("@/app/api/classroom/evaluation/route");

function makeRequest(evaluationId?: string) {
  const url = new URL("http://localhost/api/classroom/evaluation");
  if (evaluationId !== undefined) url.searchParams.set("evaluationId", evaluationId);
  return new Request(url.toString(), { method: "GET" });
}

const EVALUATION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000003";

describe("GET /api/classroom/evaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "student-1" } } });
    state = {
      evaluationRow: {
        id: EVALUATION_ID,
        program_id: PROGRAM_ID,
        scope: "session",
        title: "Quiz de la clase",
        passing_grade_pct: 70,
        questions_per_attempt: null,
        max_attempts: 2,
        time_limit_minutes: 30,
        is_active: true,
        opens_at: null,
        closes_at: null,
      },
      enrollmentResult: { data: { id: "enr-1", status: "active" }, error: null },
      attempts: [],
      attemptsError: null,
    };
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest(EVALUATION_ID));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
  });

  it("returns 422 when evaluationId is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("evaluationId es requerido");
  });

  it("returns 404 when the evaluation does not exist", async () => {
    state.evaluationRow = null;
    const res = await GET(makeRequest(EVALUATION_ID));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the evaluation is a draft (is_active=false)", async () => {
    (state.evaluationRow as Record<string, unknown>).is_active = false;
    const res = await GET(makeRequest(EVALUATION_ID));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the evaluation window already closed", async () => {
    (state.evaluationRow as Record<string, unknown>).closes_at = "2020-01-01T00:00:00Z";
    const res = await GET(makeRequest(EVALUATION_ID));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Esta evaluación ya cerró");
  });

  it("returns 403 when the student has no active enrollment in the program", async () => {
    state.enrollmentResult = { data: null, error: { message: "no encontrada" } };
    const res = await GET(makeRequest(EVALUATION_ID));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("No tienes una inscripción activa en este programa");
  });

  it("returns the initial state (no attempts yet) with attemptsRemaining = max_attempts", async () => {
    const res = await GET(makeRequest(EVALUATION_ID));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.title).toBe("Quiz de la clase");
    expect(json.scope).toBe("session");
    expect(json.config).toEqual({
      questionsPerAttempt: null,
      passingGradePct: 70,
      maxAttempts: 2,
      timeLimitMinutes: 30,
    });
    expect(json.attemptsUsed).toBe(0);
    expect(json.attemptsRemaining).toBe(2);
    expect(json.hasInProgress).toBe(false);
    expect(json.bestScore).toBeNull();
    expect(json.passed).toBe(false);
  });

  it("marks hasInProgress=true when there is an attempt without completed_at, without counting it as used", async () => {
    state.attempts = [{ id: "att-1", passed: null, score_pct: null, completed_at: null }];
    const res = await GET(makeRequest(EVALUATION_ID));
    const json = await res.json();
    expect(json.hasInProgress).toBe(true);
    expect(json.attemptsUsed).toBe(0);
    expect(json.attemptsRemaining).toBe(2);
  });

  it("computes bestScore as the max score_pct among completed attempts and passed=true when any passed", async () => {
    state.attempts = [
      { id: "att-1", passed: false, score_pct: 60, completed_at: "2026-07-01T00:00:00Z" },
      { id: "att-2", passed: true, score_pct: 85, completed_at: "2026-07-05T00:00:00Z" },
    ];
    const res = await GET(makeRequest(EVALUATION_ID));
    const json = await res.json();
    expect(json.attemptsUsed).toBe(2);
    expect(json.bestScore).toBe(85);
    expect(json.passed).toBe(true);
    expect(json.attemptsRemaining).toBe(0);
  });

  it("treats a null score_pct on a completed attempt as 0 for the best-score computation", async () => {
    state.attempts = [{ id: "att-1", passed: false, score_pct: null, completed_at: "2026-07-01T00:00:00Z" }];
    const res = await GET(makeRequest(EVALUATION_ID));
    const json = await res.json();
    expect(json.bestScore).toBe(0);
  });

  it("floors attemptsRemaining at 0 when completed attempts exceed max_attempts", async () => {
    (state.evaluationRow as Record<string, unknown>).max_attempts = 1;
    state.attempts = [
      { id: "att-1", passed: false, score_pct: 50, completed_at: "2026-07-01T00:00:00Z" },
      { id: "att-2", passed: false, score_pct: 60, completed_at: "2026-07-05T00:00:00Z" },
    ];
    const res = await GET(makeRequest(EVALUATION_ID));
    const json = await res.json();
    expect(json.attemptsRemaining).toBe(0);
  });

  it("returns 500 when the quiz_attempts query fails instead of treating it as 'no attempts yet'", async () => {
    state.attempts = null;
    state.attemptsError = { message: "timeout de BD" };
    const res = await GET(makeRequest(EVALUATION_ID));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No se pudo cargar tu intento, inténtalo de nuevo");
  });
});
