import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";

// --- Mock de autorización ---------------------------------------------------
let authResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

// --- Mock del cliente admin de Supabase -------------------------------------
type State = {
  evaluationRow: { id: string; program_id: string } | null;
  finalEvalRow: { id: string } | null;
  lastQuestionRow: { sort_order: number } | null;
  getQuestionsResult: { data: unknown[] | null; error: unknown };
  insertResult: { data: unknown; error: unknown };
  updateResult: { data: unknown; error: unknown };
  deleteGuardRow: { evaluation_id: string | null } | null;
  attemptsCount: number | null;
  deleteResult: { error: unknown };
};
let state: State;
let capturedInsert: Record<string, unknown> | null;
let capturedUpdate: Record<string, unknown> | null;

function makeBuilder(table: string) {
  const ops: Array<[string, unknown[]]> = [];
  const chain = ["select", "eq", "in", "is", "order", "limit"];
  const builder: Record<string, unknown> = {};
  for (const m of chain) {
    builder[m] = (...args: unknown[]) => {
      ops.push([m, args]);
      return builder;
    };
  }
  builder.insert = (arg: Record<string, unknown>) => {
    capturedInsert = arg;
    ops.push(["insert", [arg]]);
    return builder;
  };
  builder.update = (arg: Record<string, unknown>) => {
    capturedUpdate = arg;
    ops.push(["update", [arg]]);
    return builder;
  };
  builder.delete = (...args: unknown[]) => {
    ops.push(["delete", args]);
    return builder;
  };

  const has = (m: string) => ops.some(([mm]) => mm === m);
  const eqArgs = () => ops.filter(([mm]) => mm === "eq").map(([, args]) => args);
  const selectArg = () => (ops.find(([mm]) => mm === "select")?.[1]?.[0] as string) ?? "";

  const resolve = () => {
    if (table === "evaluations") {
      if (eqArgs().some((a) => a[0] === "id")) {
        return { data: state.evaluationRow, error: null };
      }
      return { data: state.finalEvalRow, error: null };
    }
    if (table === "quiz_questions") {
      if (has("insert")) return state.insertResult;
      if (has("update")) return state.updateResult;
      if (has("delete")) return state.deleteResult;
      const sel = selectArg();
      if (sel.includes("lessons")) return state.getQuestionsResult;
      if (sel === "evaluation_id") return { data: state.deleteGuardRow, error: null };
      return { data: state.lastQuestionRow, error: null };
    }
    if (table === "quiz_attempts") {
      return { count: state.attemptsCount, error: null };
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

const { GET, POST, PATCH, DELETE } = await import("@/app/api/admin/quiz-questions/route");

const PROGRAM_ID = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const EVAL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";
const QUESTION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-333333333333";
const LESSON_ID = "aaaaaaaa-bbbb-4ccc-8ddd-444444444444";

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function rawReq(url: string, method: string, rawBody: string) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

const validSingleChoicePayload = {
  questionType: "single_choice" as const,
  questionText: "¿Cuál es la capital de Chile?",
  options: { A: "Santiago", B: "Lima" },
  correctAnswer: "A",
};

const invalidPayload = {
  questionType: "single_choice" as const,
  questionText: "Pregunta con una sola opción",
  options: { A: "Única opción" }, // menos de 2 opciones -> falla el refine
  correctAnswer: "A",
};

const authOk = () => ({ user: { id: "admin-1" } });
const authDenied = () => ({
  error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
});

beforeEach(() => {
  vi.clearAllMocks();
  authResult = authOk();
  capturedInsert = null;
  capturedUpdate = null;
  state = {
    evaluationRow: { id: EVAL_ID, program_id: PROGRAM_ID },
    finalEvalRow: { id: EVAL_ID },
    lastQuestionRow: null,
    getQuestionsResult: { data: [{ id: QUESTION_ID, question_text: "X" }], error: null },
    insertResult: { data: { id: QUESTION_ID, question_text: "X" }, error: null },
    updateResult: { data: { id: QUESTION_ID, question_text: "Editada" }, error: null },
    deleteGuardRow: { evaluation_id: EVAL_ID },
    attemptsCount: 0,
    deleteResult: { error: null },
  };
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("GET /api/admin/quiz-questions", () => {
  it("401 cuando no está autenticado", async () => {
    authResult = authDenied();
    const res = await GET(new Request(`http://x/api/admin/quiz-questions?programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(401);
  });

  it("422 cuando falta programId", async () => {
    const res = await GET(new Request("http://x/api/admin/quiz-questions"));
    expect(res!.status).toBe(422);
  });

  it("200 devuelve las preguntas del programa", async () => {
    const res = await GET(new Request(`http://x/api/admin/quiz-questions?programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.questions).toHaveLength(1);
  });

  it("200 con lista vacía cuando data es null", async () => {
    state.getQuestionsResult = { data: null, error: null };
    const res = await GET(new Request(`http://x/api/admin/quiz-questions?programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.questions).toEqual([]);
  });

  it("500 cuando falla la consulta", async () => {
    state.getQuestionsResult = { data: null, error: { message: "boom" } };
    const res = await GET(new Request(`http://x/api/admin/quiz-questions?programId=${PROGRAM_ID}`));
    expect(res!.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe("POST /api/admin/quiz-questions", () => {
  it("401 cuando no está autenticado", async () => {
    authResult = authDenied();
    const res = await POST(jsonReq("http://x/api/admin/quiz-questions", "POST", { programId: PROGRAM_ID, ...validSingleChoicePayload }));
    expect(res!.status).toBe(401);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const res = await POST(rawReq("http://x/api/admin/quiz-questions", "POST", "{esto no es json"));
    expect(res!.status).toBe(400);
  });

  it("422 cuando no se envía evaluationId ni programId", async () => {
    const res = await POST(jsonReq("http://x/api/admin/quiz-questions", "POST", validSingleChoicePayload));
    expect(res!.status).toBe(422);
  });

  it("422 cuando evaluationId tiene formato inválido (falla el schema de destino)", async () => {
    const res = await POST(
      jsonReq("http://x/api/admin/quiz-questions", "POST", { evaluationId: "no-es-un-uuid", ...validSingleChoicePayload }),
    );
    expect(res!.status).toBe(422);
  });

  it("422 cuando el payload de la pregunta falla la validación por tipo", async () => {
    const res = await POST(
      jsonReq("http://x/api/admin/quiz-questions", "POST", { programId: PROGRAM_ID, ...invalidPayload }),
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.issues).toBeDefined();
  });

  it("404 cuando la evaluación indicada no existe", async () => {
    state.evaluationRow = null;
    const res = await POST(
      jsonReq("http://x/api/admin/quiz-questions", "POST", { evaluationId: EVAL_ID, ...validSingleChoicePayload }),
    );
    expect(res!.status).toBe(404);
  });

  it("201 crea la pregunta anclada a evaluationId y hereda su program_id", async () => {
    const res = await POST(
      jsonReq("http://x/api/admin/quiz-questions", "POST", { evaluationId: EVAL_ID, lessonId: LESSON_ID, ...validSingleChoicePayload }),
    );
    expect(res!.status).toBe(201);
    expect(capturedInsert?.program_id).toBe(PROGRAM_ID);
    expect(capturedInsert?.evaluation_id).toBe(EVAL_ID);
    expect(capturedInsert?.lesson_id).toBe(LESSON_ID);
  });

  it("201 con solo programId: usa la evaluación final del programa (compat)", async () => {
    const res = await POST(
      jsonReq("http://x/api/admin/quiz-questions", "POST", { programId: PROGRAM_ID, ...validSingleChoicePayload }),
    );
    expect(res!.status).toBe(201);
    expect(capturedInsert?.evaluation_id).toBe(EVAL_ID);
    expect(capturedInsert?.lesson_id).toBeNull();
  });

  it("201 con programId sin evaluación final: evaluation_id queda null", async () => {
    state.finalEvalRow = null;
    const res = await POST(
      jsonReq("http://x/api/admin/quiz-questions", "POST", { programId: PROGRAM_ID, ...validSingleChoicePayload }),
    );
    expect(res!.status).toBe(201);
    expect(capturedInsert?.evaluation_id).toBeNull();
    expect(capturedInsert?.program_id).toBe(PROGRAM_ID);
  });

  it("sort_order es 1 cuando no hay preguntas previas", async () => {
    state.lastQuestionRow = null;
    await POST(jsonReq("http://x/api/admin/quiz-questions", "POST", { programId: PROGRAM_ID, ...validSingleChoicePayload }));
    expect(capturedInsert?.sort_order).toBe(1);
  });

  it("sort_order continúa la secuencia existente", async () => {
    state.lastQuestionRow = { sort_order: 5 };
    await POST(jsonReq("http://x/api/admin/quiz-questions", "POST", { programId: PROGRAM_ID, ...validSingleChoicePayload }));
    expect(capturedInsert?.sort_order).toBe(6);
  });

  it("422 cuando la base de datos rechaza por restricción (23514)", async () => {
    state.insertResult = { data: null, error: { code: "23514", message: "check constraint" } };
    const res = await POST(
      jsonReq("http://x/api/admin/quiz-questions", "POST", { programId: PROGRAM_ID, ...validSingleChoicePayload }),
    );
    expect(res!.status).toBe(422);
  });

  it("500 cuando falla la inserción por otra razón", async () => {
    state.insertResult = { data: null, error: { code: "OTHER", message: "boom" } };
    const res = await POST(
      jsonReq("http://x/api/admin/quiz-questions", "POST", { programId: PROGRAM_ID, ...validSingleChoicePayload }),
    );
    expect(res!.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/quiz-questions", () => {
  it("401 cuando no está autenticado", async () => {
    authResult = authDenied();
    const res = await PATCH(jsonReq("http://x/api/admin/quiz-questions", "PATCH", { questionId: QUESTION_ID, sortOrder: 2 }));
    expect(res!.status).toBe(401);
  });

  it("400 cuando el body no es JSON válido", async () => {
    const res = await PATCH(rawReq("http://x/api/admin/quiz-questions", "PATCH", "{esto no es json"));
    expect(res!.status).toBe(400);
  });

  it("422 cuando falta questionId", async () => {
    const res = await PATCH(jsonReq("http://x/api/admin/quiz-questions", "PATCH", { sortOrder: 2 }));
    expect(res!.status).toBe(422);
  });

  it("422 cuando no se envía questionType ni sortOrder (nada para actualizar)", async () => {
    const res = await PATCH(jsonReq("http://x/api/admin/quiz-questions", "PATCH", { questionId: QUESTION_ID }));
    expect(res!.status).toBe(422);
  });

  it("422 cuando el payload con questionType falla la validación", async () => {
    const res = await PATCH(
      jsonReq("http://x/api/admin/quiz-questions", "PATCH", { questionId: QUESTION_ID, ...invalidPayload }),
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.issues).toBeDefined();
  });

  it("200 actualiza tipo/opciones/respuesta y sort_order juntos", async () => {
    const res = await PATCH(
      jsonReq("http://x/api/admin/quiz-questions", "PATCH", {
        questionId: QUESTION_ID,
        sortOrder: 3,
        ...validSingleChoicePayload,
      }),
    );
    expect(res!.status).toBe(200);
    expect(capturedUpdate?.sort_order).toBe(3);
    expect(capturedUpdate?.question_text).toBe(validSingleChoicePayload.questionText);
    expect(capturedUpdate?.correct_answer).toBe("A");
  });

  it("200 actualiza solo sort_order (incluso cuando es 0)", async () => {
    const res = await PATCH(
      jsonReq("http://x/api/admin/quiz-questions", "PATCH", { questionId: QUESTION_ID, sortOrder: 0 }),
    );
    expect(res!.status).toBe(200);
    expect(capturedUpdate).toEqual({ sort_order: 0 });
  });

  it("422 cuando la base de datos rechaza por restricción (23514)", async () => {
    state.updateResult = { data: null, error: { code: "23514", message: "check constraint" } };
    const res = await PATCH(
      jsonReq("http://x/api/admin/quiz-questions", "PATCH", { questionId: QUESTION_ID, sortOrder: 1 }),
    );
    expect(res!.status).toBe(422);
  });

  it("500 cuando falla la actualización por otra razón", async () => {
    state.updateResult = { data: null, error: { code: "OTHER", message: "boom" } };
    const res = await PATCH(
      jsonReq("http://x/api/admin/quiz-questions", "PATCH", { questionId: QUESTION_ID, sortOrder: 1 }),
    );
    expect(res!.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/quiz-questions", () => {
  it("401 cuando no está autenticado", async () => {
    authResult = authDenied();
    const res = await DELETE(new Request(`http://x/api/admin/quiz-questions?id=${QUESTION_ID}`, { method: "DELETE" }));
    expect(res!.status).toBe(401);
  });

  it("422 cuando falta id", async () => {
    const res = await DELETE(new Request("http://x/api/admin/quiz-questions", { method: "DELETE" }));
    expect(res!.status).toBe(422);
  });

  it("409 cuando hay intentos en curso de la evaluación dueña", async () => {
    state.deleteGuardRow = { evaluation_id: EVAL_ID };
    state.attemptsCount = 2;
    const res = await DELETE(new Request(`http://x/api/admin/quiz-questions?id=${QUESTION_ID}`, { method: "DELETE" }));
    expect(res!.status).toBe(409);
  });

  it("200 elimina cuando no hay intentos en curso", async () => {
    state.deleteGuardRow = { evaluation_id: EVAL_ID };
    state.attemptsCount = 0;
    const res = await DELETE(new Request(`http://x/api/admin/quiz-questions?id=${QUESTION_ID}`, { method: "DELETE" }));
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.ok).toBe(true);
  });

  it("200 elimina sin chequear intentos cuando la pregunta no tiene evaluation_id", async () => {
    state.deleteGuardRow = { evaluation_id: null };
    const res = await DELETE(new Request(`http://x/api/admin/quiz-questions?id=${QUESTION_ID}`, { method: "DELETE" }));
    expect(res!.status).toBe(200);
  });

  it("200 elimina sin chequear intentos cuando la pregunta no existe (guard no encuentra fila)", async () => {
    state.deleteGuardRow = null;
    const res = await DELETE(new Request(`http://x/api/admin/quiz-questions?id=${QUESTION_ID}`, { method: "DELETE" }));
    expect(res!.status).toBe(200);
  });

  it("500 cuando falla el borrado", async () => {
    state.deleteGuardRow = { evaluation_id: null };
    state.deleteResult = { error: { message: "boom" } };
    const res = await DELETE(new Request(`http://x/api/admin/quiz-questions?id=${QUESTION_ID}`, { method: "DELETE" }));
    expect(res!.status).toBe(500);
  });
});
