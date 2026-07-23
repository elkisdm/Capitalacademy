import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type Result = { data: unknown; error: unknown };

type State = {
  listResult: Result;
  moduleResult: Result;
  lessonResult: Result;
  sessionResult: Result;
  insertResult: Result;
};
let state: State;
let capturedInsert: Record<string, unknown> | null;

function makeBuilder(table: string) {
  const ops: Array<[string, unknown[]]> = [];
  const chain = ["select", "eq", "order", "limit"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = (...args: unknown[]) => {
      ops.push([m, args]);
      return builder;
    };
  }
  builder.insert = (...args: unknown[]) => {
    ops.push(["insert", args]);
    if (table === "evaluations") capturedInsert = args[0] as Record<string, unknown>;
    return builder;
  };
  const hasOp = (m: string) => ops.some(([mm]) => mm === m);
  const resolve = (): Result => {
    if (table === "program_modules") return state.moduleResult;
    if (table === "lessons") return state.lessonResult;
    if (table === "class_sessions") return state.sessionResult;
    if (table === "evaluations") {
      if (hasOp("insert")) return state.insertResult;
      return state.listResult;
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
  createAdminClient: vi.fn(() => ({ from: (table: string) => makeBuilder(table) })),
}));

const { GET, POST } = await import("@/app/api/admin/evaluations/route");

const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
const OTHER_PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000009";
const MODULE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000002";
const LESSON_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000003";
const SESSION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-000000000004";

function getReq(qs: string) {
  return new Request(`http://x/api/admin/evaluations${qs ? `?${qs}` : ""}`);
}
function postReq(body: unknown) {
  return new Request("http://x/api/admin/evaluations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function postReqRaw(rawBody: string) {
  return new Request("http://x/api/admin/evaluations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authResult = { user: { id: "admin-1" } };
  capturedInsert = null;
  state = {
    listResult: { data: [], error: null },
    moduleResult: { data: { id: MODULE_ID, program_id: PROGRAM_ID }, error: null },
    lessonResult: {
      data: { id: LESSON_ID, program_modules: { program_id: PROGRAM_ID } },
      error: null,
    },
    sessionResult: {
      data: { id: SESSION_ID, cohorts: { program_id: PROGRAM_ID } },
      error: null,
    },
    insertResult: { data: { id: "eval-1" }, error: null },
  };
});

describe("GET /api/admin/evaluations", () => {
  it("401 cuando no autenticado", async () => {
    authResult = { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(401);
  });

  it("422 cuando falta programId", async () => {
    const res = await GET(getReq(""));
    expect(res!.status).toBe(422);
  });

  it("200 lista evaluaciones normalizando questionCount desde el conteo embebido", async () => {
    state.listResult = {
      data: [
        { id: "e1", title: "Final", quiz_questions: [{ count: 3 }] },
        { id: "e2", title: "Sin preguntas", quiz_questions: [] },
        { id: "e3", title: "Sin campo embebido" },
      ],
      error: null,
    };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.evaluations).toHaveLength(3);
    expect(json.evaluations[0].questionCount).toBe(3);
    expect(json.evaluations[0].quiz_questions).toBeUndefined();
    expect(json.evaluations[1].questionCount).toBe(0);
    expect(json.evaluations[2].questionCount).toBe(0);
  });

  it("200 aplica filtros de scope, lessonId, moduleId y sessionId sin romper", async () => {
    const res = await GET(
      getReq(
        `programId=${PROGRAM_ID}&scope=lesson&lessonId=${LESSON_ID}&moduleId=${MODULE_ID}&sessionId=${SESSION_ID}`,
      ),
    );
    expect(res!.status).toBe(200);
  });

  it("200 con data null devuelve evaluations vacío", async () => {
    state.listResult = { data: null, error: null };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.evaluations).toEqual([]);
  });

  it("500 cuando la consulta falla", async () => {
    state.listResult = { data: null, error: { message: "boom" } };
    const res = await GET(getReq(`programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(500);
  });
});

describe("POST /api/admin/evaluations — auth y body", () => {
  it("401 cuando no autenticado", async () => {
    authResult = { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
    const res = await POST(postReq({ programId: PROGRAM_ID, scope: "final", title: "X" }));
    expect(res!.status).toBe(401);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const res = await POST(postReqRaw("{ esto no es json"));
    expect(res!.status).toBe(400);
  });
});

describe("POST /api/admin/evaluations — validación de esquema", () => {
  it("422 cuando falta programId", async () => {
    const res = await POST(postReq({ scope: "final", title: "X" }));
    expect(res!.status).toBe(422);
  });

  it("422 cuando scope no es uno de los valores permitidos", async () => {
    const res = await POST(postReq({ programId: PROGRAM_ID, scope: "bogus", title: "X" }));
    expect(res!.status).toBe(422);
  });

  it("422 cuando closesAt es anterior o igual a opensAt", async () => {
    const res = await POST(
      postReq({
        programId: PROGRAM_ID,
        scope: "final",
        title: "X",
        opensAt: "2026-01-10T00:00:00.000Z",
        closesAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.issues.some((i: { path: string[] }) => i.path.includes("closesAt"))).toBe(true);
  });

  it("422 cuando scope=module no trae moduleId", async () => {
    const res = await POST(postReq({ programId: PROGRAM_ID, scope: "module", title: "X" }));
    expect(res!.status).toBe(422);
  });

  it("422 cuando scope=lesson no trae lessonId", async () => {
    const res = await POST(postReq({ programId: PROGRAM_ID, scope: "lesson", title: "X" }));
    expect(res!.status).toBe(422);
  });

  it("422 cuando scope=session no trae sessionId", async () => {
    const res = await POST(postReq({ programId: PROGRAM_ID, scope: "session", title: "X" }));
    expect(res!.status).toBe(422);
  });

  it("422 cuando scope=final trae moduleId (no debe llevar módulo/lección/sesión)", async () => {
    const res = await POST(
      postReq({ programId: PROGRAM_ID, scope: "final", title: "X", moduleId: MODULE_ID }),
    );
    expect(res!.status).toBe(422);
  });

  it("422 cuando scope=lesson trae sessionId además de lessonId", async () => {
    const res = await POST(
      postReq({
        programId: PROGRAM_ID,
        scope: "lesson",
        title: "X",
        lessonId: LESSON_ID,
        sessionId: SESSION_ID,
      }),
    );
    expect(res!.status).toBe(422);
  });

  it("422 cuando scope=module trae lessonId además de moduleId", async () => {
    const res = await POST(
      postReq({
        programId: PROGRAM_ID,
        scope: "module",
        title: "X",
        moduleId: MODULE_ID,
        lessonId: LESSON_ID,
      }),
    );
    expect(res!.status).toBe(422);
  });

  it("422 cuando scope=session trae moduleId además de sessionId", async () => {
    const res = await POST(
      postReq({
        programId: PROGRAM_ID,
        scope: "session",
        title: "X",
        sessionId: SESSION_ID,
        moduleId: MODULE_ID,
      }),
    );
    expect(res!.status).toBe(422);
  });
});

describe("POST /api/admin/evaluations — seguridad de tenant", () => {
  it("422 cuando el módulo no existe", async () => {
    state.moduleResult = { data: null, error: null };
    const res = await POST(
      postReq({ programId: PROGRAM_ID, scope: "module", title: "X", moduleId: MODULE_ID }),
    );
    expect(res!.status).toBe(422);
  });

  it("422 cuando el módulo pertenece a otro programa", async () => {
    state.moduleResult = { data: { id: MODULE_ID, program_id: OTHER_PROGRAM_ID }, error: null };
    const res = await POST(
      postReq({ programId: PROGRAM_ID, scope: "module", title: "X", moduleId: MODULE_ID }),
    );
    expect(res!.status).toBe(422);
  });

  it("422 cuando la lección no existe", async () => {
    state.lessonResult = { data: null, error: null };
    const res = await POST(
      postReq({ programId: PROGRAM_ID, scope: "lesson", title: "X", lessonId: LESSON_ID }),
    );
    expect(res!.status).toBe(422);
  });

  it("422 cuando la lección pertenece a otro programa", async () => {
    state.lessonResult = {
      data: { id: LESSON_ID, program_modules: { program_id: OTHER_PROGRAM_ID } },
      error: null,
    };
    const res = await POST(
      postReq({ programId: PROGRAM_ID, scope: "lesson", title: "X", lessonId: LESSON_ID }),
    );
    expect(res!.status).toBe(422);
  });

  it("422 cuando la sesión no existe", async () => {
    state.sessionResult = { data: null, error: null };
    const res = await POST(
      postReq({ programId: PROGRAM_ID, scope: "session", title: "X", sessionId: SESSION_ID }),
    );
    expect(res!.status).toBe(422);
  });

  it("422 cuando la sesión pertenece a otro programa (vía cohorte)", async () => {
    state.sessionResult = {
      data: { id: SESSION_ID, cohorts: { program_id: OTHER_PROGRAM_ID } },
      error: null,
    };
    const res = await POST(
      postReq({ programId: PROGRAM_ID, scope: "session", title: "X", sessionId: SESSION_ID }),
    );
    expect(res!.status).toBe(422);
  });
});

describe("POST /api/admin/evaluations — creación exitosa y defaults", () => {
  it("201 scope=final aplica defaults (passing 70, maxAttempts 3, minCompletion 80, kind quiz)", async () => {
    const res = await POST(postReq({ programId: PROGRAM_ID, scope: "final", title: "Examen final" }));
    expect(res!.status).toBe(201);
    expect(capturedInsert).toMatchObject({
      program_id: PROGRAM_ID,
      scope: "final",
      module_id: null,
      lesson_id: null,
      session_id: null,
      kind: "quiz",
      weight_pct: null,
      passing_grade_pct: 70,
      questions_per_attempt: null,
      max_attempts: 3,
      time_limit_minutes: null,
      min_completion_pct: 80,
      is_active: false,
      opens_at: null,
      closes_at: null,
    });
  });

  it("201 scope=final respeta minCompletionPct explícito", async () => {
    const res = await POST(
      postReq({ programId: PROGRAM_ID, scope: "final", title: "Examen", minCompletionPct: 60 }),
    );
    expect(res!.status).toBe(201);
    expect(capturedInsert?.min_completion_pct).toBe(60);
  });

  it("201 scope=module ignora minCompletionPct (min_completion_pct siempre null fuera de final)", async () => {
    const res = await POST(
      postReq({
        programId: PROGRAM_ID,
        scope: "module",
        title: "Quiz módulo",
        moduleId: MODULE_ID,
        minCompletionPct: 90,
      }),
    );
    expect(res!.status).toBe(201);
    expect(capturedInsert?.min_completion_pct).toBeNull();
    expect(capturedInsert?.module_id).toBe(MODULE_ID);
    expect(capturedInsert?.lesson_id).toBeNull();
    expect(capturedInsert?.session_id).toBeNull();
  });

  it("201 scope=lesson enlaza lesson_id y deja module_id/session_id en null", async () => {
    const res = await POST(
      postReq({ programId: PROGRAM_ID, scope: "lesson", title: "Quiz lección", lessonId: LESSON_ID }),
    );
    expect(res!.status).toBe(201);
    expect(capturedInsert?.lesson_id).toBe(LESSON_ID);
    expect(capturedInsert?.module_id).toBeNull();
    expect(capturedInsert?.session_id).toBeNull();
  });

  it("201 scope=session enlaza session_id y deja module_id/lesson_id en null", async () => {
    const res = await POST(
      postReq({ programId: PROGRAM_ID, scope: "session", title: "Quiz en vivo", sessionId: SESSION_ID }),
    );
    expect(res!.status).toBe(201);
    expect(capturedInsert?.session_id).toBe(SESSION_ID);
    expect(capturedInsert?.module_id).toBeNull();
    expect(capturedInsert?.lesson_id).toBeNull();
  });

  it("201 acepta valores explícitos: kind manual, weightPct, ventana de fechas e isActive", async () => {
    const res = await POST(
      postReq({
        programId: PROGRAM_ID,
        scope: "final",
        title: "Guión de venta",
        kind: "manual",
        weightPct: 25.5,
        isActive: true,
        opensAt: "2026-01-01T00:00:00.000Z",
        closesAt: "2026-02-01T00:00:00.000Z",
        maxAttempts: 5,
        timeLimitMinutes: 30,
        questionsPerAttempt: 10,
        passingGradePct: 80,
      }),
    );
    expect(res!.status).toBe(201);
    expect(capturedInsert).toMatchObject({
      kind: "manual",
      weight_pct: 25.5,
      is_active: true,
      opens_at: "2026-01-01T00:00:00.000Z",
      closes_at: "2026-02-01T00:00:00.000Z",
      max_attempts: 5,
      time_limit_minutes: 30,
      questions_per_attempt: 10,
      passing_grade_pct: 80,
    });
    const json = await res!.json();
    expect(json.evaluation).toEqual({ id: "eval-1" });
  });
});

describe("POST /api/admin/evaluations — errores al insertar", () => {
  it("409 cuando la BD reporta unique_violation (23505)", async () => {
    state.insertResult = { data: null, error: { code: "23505", message: "duplicate" } };
    const res = await POST(postReq({ programId: PROGRAM_ID, scope: "final", title: "X" }));
    expect(res!.status).toBe(409);
  });

  it("422 cuando la BD reporta check_violation (23514, ventana de fechas)", async () => {
    state.insertResult = { data: null, error: { code: "23514", message: "check" } };
    const res = await POST(postReq({ programId: PROGRAM_ID, scope: "final", title: "X" }));
    expect(res!.status).toBe(422);
  });

  it("500 cuando la BD reporta un error genérico", async () => {
    state.insertResult = { data: null, error: { code: "99999", message: "boom" } };
    const res = await POST(postReq({ programId: PROGRAM_ID, scope: "final", title: "X" }));
    expect(res!.status).toBe(500);
  });
});
