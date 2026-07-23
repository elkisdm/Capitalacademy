import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/* Mocks — solo bordes externos: los dos clientes de Supabase.         */
/* resolveEvaluationAccess / toPublicConfig / selectEvaluationQuestions/*
/* getPresentedEvaluationQuestions corren de verdad, alimentados por    */
/* estos mocks (no se stubean directo).                                */
/* ------------------------------------------------------------------ */

const mockGetUser = vi.fn();

type State = {
  evaluationRow: Record<string, unknown> | null;
  enrollmentResult: { data: Record<string, unknown> | null; error: unknown };
  attempts: Array<Record<string, unknown>> | null;
  attemptsError: unknown;
  questionsPool: Array<Record<string, unknown>>;
  presentedQuestions: Array<Record<string, unknown>>;
  insertResult: { data: Record<string, unknown> | null; error: unknown };
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
  const chain = ["select", "insert", "eq", "in", "order", "limit"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = (...args: unknown[]) => {
      ops.push(m);
      return builder;
    };
  }

  builder.single = () => {
    if (table === "evaluations") {
      return Promise.resolve({
        data: state.evaluationRow,
        error: state.evaluationRow ? null : { message: "no encontrada" },
      });
    }
    if (table === "quiz_attempts") {
      // Solo se llega acá tras `.insert(...).select(...).single()`.
      return Promise.resolve(state.insertResult);
    }
    return Promise.resolve({ data: null, error: null });
  };

  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
    let result: Record<string, unknown> = { data: null, error: null };
    if (table === "quiz_attempts") {
      // Query de listado de intentos (sin insert): select().eq().eq().order()
      result = { data: state.attempts, error: state.attemptsError ?? null };
    } else if (table === "quiz_questions") {
      // getPresentedEvaluationQuestions usa `.in(...)`; selectEvaluationQuestions no.
      result = ops.includes("in")
        ? { data: state.presentedQuestions, error: null }
        : { data: state.questionsPool, error: null };
    }
    return Promise.resolve(result).then(resolve, reject);
  };

  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeAdminBuilder(table) })),
}));

const { POST } = await import("@/app/api/classroom/evaluation/start/route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/classroom/evaluation/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const EVALUATION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
const ATTEMPT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000002";
const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000003";
const NEW_ATTEMPT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000004";
const Q1 = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const Q2 = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";

describe("POST /api/classroom/evaluation/start", () => {
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
        time_limit_minutes: null,
        is_active: true,
        opens_at: null,
        closes_at: null,
      },
      enrollmentResult: { data: { id: "enr-1", status: "active" }, error: null },
      attempts: [],
      attemptsError: null,
      questionsPool: [
        { id: Q1, question_text: "Pregunta 1", options: { A: "a", B: "b" }, question_type: "single_choice" },
        { id: Q2, question_text: "Pregunta 2", options: { A: "a", B: "b" }, question_type: "single_choice" },
      ],
      presentedQuestions: [
        { id: Q1, question_text: "Pregunta 1", options: { A: "a", B: "b" }, question_type: "single_choice" },
      ],
      insertResult: {
        data: { id: NEW_ATTEMPT_ID, started_at: "2026-07-22T10:00:00Z" },
        error: null,
      },
    };
  });

  const validBody = () => ({ evaluationId: EVALUATION_ID });

  // --- Auth / validación de body ---
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const req = new Request("http://localhost/api/classroom/evaluation/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "no-es-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 422 when evaluationId fails schema validation", async () => {
    const res = await POST(makeRequest({ evaluationId: "not-a-uuid" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(Array.isArray(json.issues)).toBe(true);
  });

  // --- Acceso a la evaluación (resuelto por resolveEvaluationAccess) ---
  it("returns 404 when the evaluation does not exist", async () => {
    state.evaluationRow = null;
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the student has no active enrollment in the program", async () => {
    state.enrollmentResult = { data: null, error: { message: "no encontrada" } };
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
  });

  // --- Reanudar un intento incompleto ---
  it("resumes an incomplete attempt instead of creating a new one, rehydrating only the presented questions", async () => {
    state.attempts = [
      {
        id: ATTEMPT_ID,
        completed_at: null,
        questions_presented: [Q1],
        started_at: "2026-07-20T10:00:00Z",
      },
    ];
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.attemptId).toBe(ATTEMPT_ID);
    expect(json.startedAt).toBe("2026-07-20T10:00:00Z");
    expect(json.questions).toHaveLength(1);
    expect(json.questions[0].id).toBe(Q1);
    // No se generó un intento nuevo.
    expect(json.attemptId).not.toBe(NEW_ATTEMPT_ID);
  });

  it("resumes with an empty question set when questions_presented is null (dato inconsistente)", async () => {
    state.attempts = [
      { id: ATTEMPT_ID, completed_at: null, questions_presented: null, started_at: "2026-07-20T10:00:00Z" },
    ];
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.attemptId).toBe(ATTEMPT_ID);
    expect(json.questions).toEqual([]);
  });

  it("computes the attempt number as completed count + 1 when resuming", async () => {
    state.attempts = [
      { id: "old-1", completed_at: "2026-07-01T00:00:00Z", questions_presented: [Q1], started_at: "x" },
      { id: ATTEMPT_ID, completed_at: null, questions_presented: [Q1], started_at: "y" },
    ];
    const res = await POST(makeRequest(validBody()));
    const json = await res.json();
    expect(json.attempt).toBe(2);
  });

  // --- Tope de intentos ---
  it("returns 409 when the completed-attempts count already reached max_attempts", async () => {
    (state.evaluationRow as Record<string, unknown>).max_attempts = 1;
    state.attempts = [
      { id: "old-1", completed_at: "2026-07-01T00:00:00Z", questions_presented: [Q1], started_at: "x" },
    ];
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(409);
  });

  // --- Sin preguntas en el pool ---
  it("returns 404 when the evaluation has no questions yet", async () => {
    state.questionsPool = [];
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/no tiene preguntas/i);
  });

  // --- Error al insertar el intento ---
  it("returns 500 when creating the attempt fails", async () => {
    state.insertResult = { data: null, error: { message: "db down" } };
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
  });

  it("returns 500 when the insert reports no error but returns no row", async () => {
    state.insertResult = { data: null, error: null };
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
  });

  // --- Camino feliz: nuevo intento ---
  it("creates a new attempt, persists the selected question set and returns it with the public config", async () => {
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.attemptId).toBe(NEW_ATTEMPT_ID);
    expect(json.startedAt).toBe("2026-07-22T10:00:00Z");
    expect(json.questions).toHaveLength(2);
    expect(json.attempt).toBe(1);
    expect(json.config).toEqual({
      questionsPerAttempt: null,
      passingGradePct: 70,
      maxAttempts: 2,
      timeLimitMinutes: null,
    });
  });

  it("computes the attempt number as completed count + 1 for a brand new attempt", async () => {
    state.attempts = [
      { id: "old-1", completed_at: "2026-07-01T00:00:00Z", questions_presented: [Q1], started_at: "x" },
    ];
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.attempt).toBe(2);
  });

  it("responde 500 cuando la consulta de intentos previos falla", async () => {
    state.attempts = null;
    state.attemptsError = { message: "timeout de BD" };
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No se pudo cargar tu intento, inténtalo de nuevo");
  });
});
