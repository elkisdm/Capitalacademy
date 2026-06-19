import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockEnrollmentQuery = vi.fn();
const mockRpc = vi.fn();

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
  attemptsList: Array<Record<string, unknown>>;
  inserted: Record<string, unknown> | null;
  presentedQuestions: Array<Record<string, unknown>>;
  modules: Array<Record<string, unknown>>;
  totalLessons: number;
  completedLessons: number;
  rpcQuestions: Array<Record<string, unknown>> | null;
};
let state: State;

function makeBuilder(table: string) {
  const ops: Array<[string, unknown[]]> = [];
  const chain = ["select", "insert", "update", "delete", "eq", "in", "is", "not", "order", "limit"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = (...args: unknown[]) => {
      ops.push([m, args]);
      return builder;
    };
  }
  const has = (m: string) => ops.some(([mm]) => mm === m);
  const resolve = () => {
    if (table === "quiz_configs") return { data: state.config, error: state.config ? null : {} };
    if (table === "program_modules") return { data: state.modules, error: null };
    if (table === "lessons") return { count: state.totalLessons, error: null };
    if (table === "video_progress") return { count: state.completedLessons, error: null };
    if (table === "quiz_questions") return { data: state.presentedQuestions, error: null };
    if (table === "quiz_attempts") {
      if (has("insert")) return { data: state.inserted, error: state.inserted ? null : {} };
      return { data: state.attemptsList, error: null };
    }
    return { data: null, error: null };
  };
  builder.single = () => Promise.resolve(resolve());
  builder.maybeSingle = () => Promise.resolve(resolve());
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => makeBuilder(table),
    rpc: (...args: unknown[]) => {
      mockRpc(...args);
      return Promise.resolve({ data: state.rpcQuestions, error: state.rpcQuestions ? null : {} });
    },
  })),
}));

const { POST } = await import("@/app/api/classroom/quiz/start/route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/classroom/quiz/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const Q1 = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const Q2 = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";

describe("POST /api/classroom/quiz/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "student-1" } } });
    mockEnrollmentQuery.mockResolvedValue({ data: { id: "enr-1", status: "active" }, error: null });
    state = {
      config: {
        max_attempts: 1,
        passing_grade_pct: 70,
        questions_per_attempt: 2,
        min_completion_pct: 80,
        time_limit_minutes: null,
      },
      attemptsList: [],
      inserted: { id: "attempt-new", started_at: "2026-06-19T00:00:00Z" },
      presentedQuestions: [],
      modules: [{ id: "m1" }],
      totalLessons: 10,
      completedLessons: 10,
      rpcQuestions: [
        { id: Q1, question_text: "P1", options: { A: "a", B: "b" } },
        { id: Q2, question_text: "P2", options: { A: "a", B: "b" } },
      ],
    };
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ programId: PROGRAM_ID }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when no active enrollment", async () => {
    mockEnrollmentQuery.mockResolvedValue({ data: null, error: { message: "x" } });
    const res = await POST(makeRequest({ programId: PROGRAM_ID }));
    expect(res.status).toBe(403);
  });

  it("returns 404 when no quiz config", async () => {
    state.config = null;
    const res = await POST(makeRequest({ programId: PROGRAM_ID }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when student already passed", async () => {
    state.attemptsList = [{ id: "a1", passed: true, completed_at: "2026-01-01" }];
    const res = await POST(makeRequest({ programId: PROGRAM_ID }));
    expect(res.status).toBe(409);
  });

  it("returns 409 when max attempts reached (no in-progress attempt)", async () => {
    state.attemptsList = [{ id: "a1", passed: false, completed_at: "2026-01-01" }];
    const res = await POST(makeRequest({ programId: PROGRAM_ID }));
    expect(res.status).toBe(409);
  });

  it("returns 403 when completion gate is not met", async () => {
    state.completedLessons = 0; // 0/10 = 0% < 80%
    const res = await POST(makeRequest({ programId: PROGRAM_ID }));
    expect(res.status).toBe(403);
  });

  it("creates a persisted attempt with server-selected questions", async () => {
    const res = await POST(makeRequest({ programId: PROGRAM_ID }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.attemptId).toBe("attempt-new");
    expect(json.questions).toHaveLength(2);
    expect(json.questions.map((q: { id: string }) => q.id)).toEqual([Q1, Q2]);
    // Las preguntas NO deben exponer la respuesta correcta.
    expect(json.questions[0]).not.toHaveProperty("correct_option");
  });

  it("resumes an in-progress attempt instead of creating a new one", async () => {
    state.attemptsList = [
      { id: "a-open", passed: null, completed_at: null, questions_presented: [Q1, Q2], started_at: "t" },
    ];
    state.presentedQuestions = [
      { id: Q1, question_text: "P1", options: { A: "a", B: "b" } },
      { id: Q2, question_text: "P2", options: { A: "a", B: "b" } },
    ];
    const res = await POST(makeRequest({ programId: PROGRAM_ID }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.attemptId).toBe("a-open");
    expect(json.questions).toHaveLength(2);
  });
});
