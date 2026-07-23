import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks — solo bordes externos: los dos clientes de Supabase.         */
/* resolveEvaluationAccess / getCorrectAnswers / scoreAnswer corren    */
/* de verdad, alimentados por estos mocks (no se stubean directo).     */
/* syncQuizGrade sí se mockea: es un side-effect best-effort con su    */
/* propio archivo de pruebas (lib/grades/__tests__/sync-quiz-grade.ts) */
/* y no aporta ramas nuevas a este route handler.                      */
/* ------------------------------------------------------------------ */

const mockGetUser = vi.fn();

type State = {
  evaluationRow: Record<string, unknown> | null;
  enrollmentResult: { data: Record<string, unknown> | null; error: unknown };
  attemptRow: Record<string, unknown> | null;
  questions: Array<Record<string, unknown>>;
  questionsError: unknown;
  updatedRows: Array<Record<string, unknown>> | null;
  updateError: unknown;
  completedCount: number | null;
  completedCountError: unknown;
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
  const ops: string[] = [];
  const chain = ["select", "update", "insert", "eq", "in", "is", "not", "limit", "order"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = (...args: unknown[]) => {
      ops.push(m);
      return builder;
    };
  }
  const hasUpdate = () => ops.includes("update");

  builder.single = () => {
    if (table === "evaluations") {
      return Promise.resolve({
        data: state.evaluationRow,
        error: state.evaluationRow ? null : { message: "no encontrada" },
      });
    }
    if (table === "quiz_attempts") {
      return Promise.resolve({
        data: state.attemptRow,
        error: state.attemptRow ? null : { message: "no encontrado" },
      });
    }
    return Promise.resolve({ data: null, error: null });
  };

  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
    let result: Record<string, unknown> = { data: null, error: null };
    if (table === "quiz_attempts") {
      result = hasUpdate()
        ? { data: state.updatedRows, error: state.updateError ?? null }
        : { count: state.completedCount, error: state.completedCountError ?? null };
    } else if (table === "quiz_questions") {
      result = { data: state.questions, error: state.questionsError ?? null };
    }
    return Promise.resolve(result).then(resolve, reject);
  };

  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeAdminBuilder(table) })),
}));

const mockSyncQuizGrade = vi.fn();
vi.mock("@/lib/grades/sync-quiz-grade", () => ({
  syncQuizGrade: (...args: unknown[]) => mockSyncQuizGrade(...args),
}));

const { POST } = await import("@/app/api/classroom/evaluation/submit/route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/classroom/evaluation/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const EVALUATION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
const ATTEMPT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000002";
const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000003";
const OTHER_EVALUATION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000009";
const Q1 = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const Q2 = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";
const Q3 = "aaaaaaaa-bbbb-4ccc-8ddd-333333333333";
const FOREIGN = "aaaaaaaa-bbbb-4ccc-8ddd-999999999999";

describe("POST /api/classroom/evaluation/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "student-1" } } });
    state = {
      evaluationRow: {
        id: EVALUATION_ID,
        program_id: PROGRAM_ID,
        scope: "final",
        title: "Examen final",
        passing_grade_pct: 70,
        questions_per_attempt: 3,
        max_attempts: 2,
        time_limit_minutes: null,
        is_active: true,
        opens_at: null,
        closes_at: null,
      },
      enrollmentResult: { data: { id: "enr-1", status: "active" }, error: null },
      attemptRow: {
        id: ATTEMPT_ID,
        enrollment_id: "enr-1",
        evaluation_id: EVALUATION_ID,
        questions_presented: [Q1, Q2, Q3],
        completed_at: null,
      },
      questions: [
        { id: Q1, question_type: "single_choice", correct_answer: "A", correct_option: "A" },
        { id: Q2, question_type: "single_choice", correct_answer: "B", correct_option: "B" },
        { id: Q3, question_type: "single_choice", correct_answer: "C", correct_option: "C" },
      ],
      questionsError: null,
      updatedRows: [{ id: ATTEMPT_ID }],
      updateError: null,
      completedCount: 1,
      completedCountError: null,
    };
  });

  const validBody = (answers: Record<string, string>) => ({
    evaluationId: EVALUATION_ID,
    attemptId: ATTEMPT_ID,
    answers,
  });

  // --- Auth / validación de body ---
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/classroom/evaluation/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "no-es-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 when the body fails schema validation", async () => {
    const res = await POST(makeRequest({ attemptId: ATTEMPT_ID, answers: { [Q1]: "A" } }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(Array.isArray(json.issues)).toBe(true);
  });

  // --- Acceso a la evaluación (resuelto por resolveEvaluationAccess) ---
  it("returns 404 when the evaluation does not exist", async () => {
    state.evaluationRow = null;
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the student has no active enrollment in the program", async () => {
    state.enrollmentResult = { data: null, error: { message: "no encontrada" } };
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(403);
  });

  // D5 (ADR-0016): closes_at ya pasó, pero el intento se puede entregar igual.
  it("still lets the student submit when closes_at already passed (D5, ignoreClosesAt)", async () => {
    (state.evaluationRow as Record<string, unknown>).closes_at = "2020-01-01T00:00:00Z";
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [Q2]: "B", [Q3]: "C" })));
    expect(res.status).toBe(200);
  });

  // --- Intento válido: de esta matrícula/evaluación e incompleto ---
  it("returns 404 when the attempt does not exist", async () => {
    state.attemptRow = null;
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the attempt belongs to another enrollment", async () => {
    (state.attemptRow as Record<string, unknown>).enrollment_id = "OTHER-enr";
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(404);
  });

  it("returns 404 when the attempt belongs to another evaluation", async () => {
    (state.attemptRow as Record<string, unknown>).evaluation_id = OTHER_EVALUATION_ID;
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(404);
  });

  it("returns 409 when the attempt was already completed", async () => {
    (state.attemptRow as Record<string, unknown>).completed_at = "2026-01-01T00:00:00Z";
    const res = await POST(makeRequest(validBody({ [Q1]: "A" })));
    expect(res.status).toBe(409);
  });

  // --- BYPASS CERRADO: el set de preguntas lo fija el intento, no el cliente ---
  it("returns 409 when an answer references a question outside the presented set", async () => {
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [FOREIGN]: "A" })));
    expect(res.status).toBe(409);
  });

  // --- Integridad del set server-only ---
  it("returns 500 when getCorrectAnswers cannot resolve all presented questions", async () => {
    // El DB solo devuelve 2 de las 3 preguntas presentadas (dato inconsistente).
    state.questions = state.questions.slice(0, 2);
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [Q2]: "B", [Q3]: "C" })));
    expect(res.status).toBe(500);
  });

  // --- Puntuación server-side ---
  it("scores unanswered questions as incorrect and applies the passing grade", async () => {
    // Q3 queda sin respuesta: 2/3 correctas → 67%, bajo el umbral de 70%.
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [Q2]: "B" })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalQuestions).toBe(3);
    expect(json.correctCount).toBe(2);
    expect(json.score_pct).toBe(67);
    expect(json.passed).toBe(false);
    expect(json.review[Q3]).toEqual({ correct_answer: "C", is_correct: false });
  });

  it("passes when the score meets the passing grade and syncs the academic grade", async () => {
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [Q2]: "B", [Q3]: "C" })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.score_pct).toBe(100);
    expect(json.passed).toBe(true);
    expect(json.correctCount).toBe(3);
    expect(mockSyncQuizGrade).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        evaluationId: EVALUATION_ID,
        programId: PROGRAM_ID,
        enrollmentId: "enr-1",
      }),
    );
  });

  // --- Cierre atómico ---
  it("returns 500 when the atomic close fails", async () => {
    state.updateError = { message: "db down" };
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [Q2]: "B", [Q3]: "C" })));
    expect(res.status).toBe(500);
  });

  it("returns 409 when the atomic close affected no rows (concurrent submit)", async () => {
    state.updatedRows = [];
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [Q2]: "B", [Q3]: "C" })));
    expect(res.status).toBe(409);
  });

  // --- attemptsRemaining ---
  it("computes attemptsRemaining from the completed attempts count", async () => {
    state.completedCount = 1;
    (state.evaluationRow as Record<string, unknown>).max_attempts = 2;
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [Q2]: "B", [Q3]: "C" })));
    const json = await res.json();
    expect(json.attemptsRemaining).toBe(1);
  });

  it("falls back to 1 completed attempt when the count query returns null", async () => {
    state.completedCount = null;
    (state.evaluationRow as Record<string, unknown>).max_attempts = 1;
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [Q2]: "B", [Q3]: "C" })));
    const json = await res.json();
    expect(json.attemptsRemaining).toBe(0);
  });

  it("never returns a negative attemptsRemaining", async () => {
    state.completedCount = 5;
    (state.evaluationRow as Record<string, unknown>).max_attempts = 2;
    const res = await POST(makeRequest(validBody({ [Q1]: "A", [Q2]: "B", [Q3]: "C" })));
    const json = await res.json();
    expect(json.attemptsRemaining).toBe(0);
  });
});
