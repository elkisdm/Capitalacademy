import { describe, it, expect, vi } from "vitest";
import {
  scoreAnswer,
  normalizeText,
  getCompletion,
  selectRandomQuestions,
  getPresentedQuestions,
  selectEvaluationQuestions,
  getPresentedEvaluationQuestions,
  getCorrectAnswers,
  type ScorableQuestion,
} from "@/lib/classroom/quiz-runtime";

const q = (
  question_type: ScorableQuestion["question_type"],
  correct_answer: unknown,
): ScorableQuestion => ({ id: "q1", question_type, correct_answer });

// ---------------------------------------------------------------------------
// Fake mínimo del admin client de Supabase: solo las cadenas que usa
// quiz-runtime.ts (select/eq/in) + rpc. Cada tabla se configura con
// { data?, error?, count? }; si se llama varias veces a la misma tabla se
// puede pasar un array para responder distinto en cada llamada.
// ---------------------------------------------------------------------------
type Resp = { data?: unknown; error?: unknown; count?: number | null };
type Call = { table: string; method: string; args: unknown[] };

function makeQueryBuilder(resp: Resp, calls: Call[], table: string) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ table, method: m, args });
      return builder;
    };
  }
  const resolveValue = () =>
    Promise.resolve({ data: resp.data ?? null, error: resp.error ?? null, count: resp.count ?? null });
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
    resolveValue().then(onFulfilled, onRejected);
  builder.catch = (onRejected: (e: unknown) => unknown) => resolveValue().catch(onRejected);
  return builder;
}

function makeAdmin(
  fromResponses: Record<string, Resp | Resp[]>,
  rpcResponse: { data?: unknown; error?: unknown } = { data: null, error: null },
  calls: Call[] = [],
) {
  const counters: Record<string, number> = {};
  const from = vi.fn((table: string) => {
    const idx = counters[table] ?? 0;
    counters[table] = idx + 1;
    const cfg = fromResponses[table];
    const resp: Resp = Array.isArray(cfg) ? (cfg[idx] ?? cfg[cfg.length - 1] ?? {}) : (cfg ?? {});
    return makeQueryBuilder(resp, calls, table);
  });
  const rpc = vi.fn(async () => rpcResponse);
  return { from, rpc } as unknown as Parameters<typeof getCompletion>[0];
}

describe("normalizeText", () => {
  it("recorta, baja a minúsculas y quita tildes", () => {
    expect(normalizeText("  Él  ")).toBe("el");
    expect(normalizeText("ACCIÓN")).toBe("accion");
    expect(normalizeText("Múrcielago")).toBe("murcielago");
  });
});

describe("scoreAnswer — single_choice", () => {
  const question = q("single_choice", "A");
  it("correcta cuando coincide la letra", () => {
    expect(scoreAnswer(question, "A")).toBe(true);
  });
  it("incorrecta cuando no coincide", () => {
    expect(scoreAnswer(question, "B")).toBe(false);
  });
  it("incorrecta cuando no responde", () => {
    expect(scoreAnswer(question, null)).toBe(false);
    expect(scoreAnswer(question, undefined)).toBe(false);
  });
  it("incorrecta si manda un array (tipo equivocado)", () => {
    expect(scoreAnswer(question, ["A"])).toBe(false);
  });
});

describe("scoreAnswer — true_false", () => {
  const question = q("true_false", "true");
  it("correcta cuando coincide", () => {
    expect(scoreAnswer(question, "true")).toBe(true);
  });
  it("incorrecta cuando no coincide", () => {
    expect(scoreAnswer(question, "false")).toBe(false);
  });
});

describe("scoreAnswer — multiple_choice", () => {
  const question = q("multiple_choice", ["A", "C"]);
  it("correcta con el set exacto (orden indiferente)", () => {
    expect(scoreAnswer(question, ["C", "A"])).toBe(true);
  });
  it("incorrecta si falta una", () => {
    expect(scoreAnswer(question, ["A"])).toBe(false);
  });
  it("incorrecta si sobra una", () => {
    expect(scoreAnswer(question, ["A", "C", "D"])).toBe(false);
  });
  it("incorrecta sin respuesta", () => {
    expect(scoreAnswer(question, [])).toBe(false);
    expect(scoreAnswer(question, null)).toBe(false);
  });
  it("sin puntuación parcial: subconjunto no aprueba", () => {
    expect(scoreAnswer(q("multiple_choice", ["A", "B", "C"]), ["A", "B"])).toBe(false);
  });
});

describe("scoreAnswer — short_answer", () => {
  const question = q("short_answer", ["Capital", "capital inicial"]);
  it("correcta por coincidencia normalizada (mayúsculas/espacios)", () => {
    expect(scoreAnswer(question, "  CAPITAL ")).toBe(true);
  });
  it("correcta contra cualquier respuesta aceptada", () => {
    expect(scoreAnswer(question, "Capital Inicial")).toBe(true);
  });
  it("correcta ignorando tildes", () => {
    expect(scoreAnswer(q("short_answer", ["acción"]), "ACCION")).toBe(true);
  });
  it("incorrecta cuando no está en la lista", () => {
    expect(scoreAnswer(question, "deuda")).toBe(false);
  });
  it("incorrecta vacío", () => {
    expect(scoreAnswer(question, "   ")).toBe(false);
  });
});

describe("scoreAnswer — robustez de correct_answer (compat jsonb)", () => {
  it("acepta string suelto para single_choice (correct_option legacy)", () => {
    expect(scoreAnswer(q("single_choice", "B"), "B")).toBe(true);
  });
  it("tipo desconocido nunca aprueba", () => {
    expect(scoreAnswer(q("unknown" as never, "A"), "A")).toBe(false);
  });
});

describe("getCompletion", () => {
  it("calcula el porcentaje redondeado con módulos y progreso", async () => {
    const calls: Call[] = [];
    const admin = makeAdmin(
      {
        program_modules: { data: [{ id: "m1" }, { id: "m2" }] },
        lessons: { count: 10 },
        video_progress: { count: 4 },
      },
      undefined,
      calls,
    );
    const result = await getCompletion(admin, "prog1", "enroll1");
    expect(result).toEqual({ currentPct: 40, completedLessons: 4, totalLessons: 10 });

    const lessonsInCall = calls.find((c) => c.table === "lessons" && c.method === "in");
    expect(lessonsInCall?.args[1]).toEqual(["m1", "m2"]);
  });

  it("redondea el porcentaje (1/3 → 33%)", async () => {
    const admin = makeAdmin({
      program_modules: { data: [{ id: "m1" }] },
      lessons: { count: 3 },
      video_progress: { count: 1 },
    });
    const result = await getCompletion(admin, "prog1", "enroll1");
    expect(result.currentPct).toBe(33);
  });

  it("sin módulos: usa el UUID nulo como filtro y da 0% sin dividir por cero", async () => {
    const calls: Call[] = [];
    const admin = makeAdmin(
      {
        program_modules: { data: [] },
        lessons: { count: 0 },
        video_progress: { count: 0 },
      },
      undefined,
      calls,
    );
    const result = await getCompletion(admin, "prog-vacio", "enroll1");
    expect(result).toEqual({ currentPct: 0, completedLessons: 0, totalLessons: 0 });

    const lessonsInCall = calls.find((c) => c.table === "lessons" && c.method === "in");
    expect(lessonsInCall?.args[1]).toEqual(["00000000-0000-0000-0000-000000000000"]);
  });

  it("counts/data ausentes (null) caen a 0", async () => {
    const admin = makeAdmin({
      program_modules: { data: null },
      lessons: { count: null },
      video_progress: { count: null },
    });
    const result = await getCompletion(admin, "prog1", "enroll1");
    expect(result).toEqual({ currentPct: 0, completedLessons: 0, totalLessons: 0 });
  });
});

describe("selectRandomQuestions", () => {
  it("usa el resultado del RPC cuando responde sin error y con datos", async () => {
    const admin = makeAdmin(
      {},
      {
        data: [
          { id: "q1", question_text: "¿Cuánto es 2+2?", options: { A: "4" }, question_type: "multiple_choice" },
        ],
        error: null,
      },
    );
    const result = await selectRandomQuestions(admin, "prog1", 5);
    expect(result).toEqual([
      { id: "q1", question_text: "¿Cuánto es 2+2?", options: { A: "4" }, question_type: "multiple_choice" },
    ]);
  });

  it("el RPC sin question_type cae al default single_choice", async () => {
    const admin = makeAdmin(
      {},
      { data: [{ id: "q2", question_text: "t2", options: {} }], error: null },
    );
    const result = await selectRandomQuestions(admin, "prog1", 5);
    expect(result[0].question_type).toBe("single_choice");
  });

  it("con error de RPC cae al fallback en JS (pool completo del programa)", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const admin = makeAdmin(
      {
        quiz_questions: {
          data: [
            { id: "a", question_text: "A", options: {}, question_type: "single_choice" },
            { id: "b", question_text: "B", options: {}, question_type: "true_false" },
            { id: "c", question_text: "C", options: {}, question_type: "short_answer" },
          ],
        },
      },
      { data: null, error: new Error("RPC no existe") },
    );
    const result = await selectRandomQuestions(admin, "prog1", 2);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["b", "c"]);
    randomSpy.mockRestore();
  });

  it("sin error pero con data vacía/nula (RPC no configurado) también cae al fallback", async () => {
    const admin = makeAdmin(
      { quiz_questions: { data: [{ id: "x", question_text: "X", options: {}, question_type: "single_choice" }] } },
      { data: null, error: null },
    );
    const result = await selectRandomQuestions(admin, "prog1", 10);
    expect(result).toEqual([
      { id: "x", question_text: "X", options: {}, question_type: "single_choice" },
    ]);
  });

  it("fallback sin preguntas en el pool devuelve arreglo vacío", async () => {
    const admin = makeAdmin({ quiz_questions: { data: null } }, { data: null, error: new Error("sin rpc") });
    const result = await selectRandomQuestions(admin, "prog-sin-preguntas", 5);
    expect(result).toEqual([]);
  });
});

describe("getPresentedQuestions", () => {
  it("con arreglo vacío de ids devuelve [] sin consultar la base", async () => {
    const admin = makeAdmin({ quiz_questions: { data: [{ id: "q1" }] } });
    const result = await getPresentedQuestions(admin, "prog1", []);
    expect(result).toEqual([]);
    expect((admin.from as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("rehidrata en el orden pedido y descarta ids que ya no existen", async () => {
    const admin = makeAdmin({
      quiz_questions: {
        data: [
          { id: "q3", question_text: "T3", options: {}, question_type: "true_false" },
          { id: "q1", question_text: "T1", options: {}, question_type: "single_choice" },
        ],
      },
    });
    const result = await getPresentedQuestions(admin, "prog1", ["q1", "q2", "q3"]);
    expect(result.map((r) => r.id)).toEqual(["q1", "q3"]);
  });

  it("question_type ausente cae al default single_choice", async () => {
    const admin = makeAdmin({
      quiz_questions: { data: [{ id: "q1", question_text: "T1", options: {} }] },
    });
    const result = await getPresentedQuestions(admin, "prog1", ["q1"]);
    expect(result[0].question_type).toBe("single_choice");
  });

  it("data null: no encuentra ninguna y devuelve []", async () => {
    const admin = makeAdmin({ quiz_questions: { data: null } });
    const result = await getPresentedQuestions(admin, "prog1", ["q1", "q2"]);
    expect(result).toEqual([]);
  });
});

describe("selectEvaluationQuestions", () => {
  it("sin límite (undefined) devuelve todo el pool de la evaluación", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const admin = makeAdmin({
      quiz_questions: {
        data: [
          { id: "a", question_text: "A", options: {}, question_type: "single_choice" },
          { id: "b", question_text: "B", options: {}, question_type: "single_choice" },
        ],
      },
    });
    const result = await selectEvaluationQuestions(admin, "eval1");
    expect(result).toHaveLength(2);
    randomSpy.mockRestore();
  });

  it("con límite null devuelve todo el pool (igual que undefined)", async () => {
    const admin = makeAdmin({
      quiz_questions: {
        data: [{ id: "a", question_text: "A", options: {}, question_type: "single_choice" }],
      },
    });
    const result = await selectEvaluationQuestions(admin, "eval1", null);
    expect(result).toHaveLength(1);
  });

  it("con límite numérico recorta el pool", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const admin = makeAdmin({
      quiz_questions: {
        data: [
          { id: "a", question_text: "A", options: {}, question_type: "single_choice" },
          { id: "b", question_text: "B", options: {}, question_type: "single_choice" },
          { id: "c", question_text: "C", options: {}, question_type: "single_choice" },
        ],
      },
    });
    const result = await selectEvaluationQuestions(admin, "eval1", 2);
    expect(result).toHaveLength(2);
    randomSpy.mockRestore();
  });

  it("pool vacío (data null) devuelve []", async () => {
    const admin = makeAdmin({ quiz_questions: { data: null } });
    const result = await selectEvaluationQuestions(admin, "eval-sin-preguntas", 5);
    expect(result).toEqual([]);
  });
});

describe("getPresentedEvaluationQuestions", () => {
  it("con arreglo vacío de ids devuelve [] sin consultar la base", async () => {
    const admin = makeAdmin({ quiz_questions: { data: [{ id: "q1" }] } });
    const result = await getPresentedEvaluationQuestions(admin, "eval1", []);
    expect(result).toEqual([]);
    expect((admin.from as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("rehidrata en el orden pedido y descarta ids que ya no existen", async () => {
    const admin = makeAdmin({
      quiz_questions: {
        data: [
          { id: "q2", question_text: "T2", options: {}, question_type: "multiple_choice" },
          { id: "q1", question_text: "T1", options: {}, question_type: "single_choice" },
        ],
      },
    });
    const result = await getPresentedEvaluationQuestions(admin, "eval1", ["q1", "q2", "q3"]);
    expect(result.map((r) => r.id)).toEqual(["q1", "q2"]);
  });

  it("data null: devuelve []", async () => {
    const admin = makeAdmin({ quiz_questions: { data: null } });
    const result = await getPresentedEvaluationQuestions(admin, "eval1", ["q1"]);
    expect(result).toEqual([]);
  });
});

describe("getCorrectAnswers", () => {
  it("con arreglo vacío de ids devuelve [] sin consultar la base", async () => {
    const admin = makeAdmin({ quiz_questions: { data: [{ id: "q1" }] } });
    const result = await getCorrectAnswers(admin, "eval1", []);
    expect(result).toEqual([]);
    expect((admin.from as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("usa correct_answer cuando está poblado", async () => {
    const admin = makeAdmin({
      quiz_questions: {
        data: [{ id: "q1", question_type: "single_choice", correct_answer: "A", correct_option: "B" }],
      },
    });
    const result = await getCorrectAnswers(admin, "eval1", ["q1"]);
    expect(result).toEqual([{ id: "q1", question_type: "single_choice", correct_answer: "A" }]);
  });

  it("compat: correct_answer null cae a correct_option legacy", async () => {
    const admin = makeAdmin({
      quiz_questions: {
        data: [{ id: "q1", question_type: "single_choice", correct_answer: null, correct_option: "C" }],
      },
    });
    const result = await getCorrectAnswers(admin, "eval1", ["q1"]);
    expect(result[0].correct_answer).toBe("C");
  });

  it("question_type ausente cae al default single_choice", async () => {
    const admin = makeAdmin({
      quiz_questions: {
        data: [{ id: "q1", correct_answer: "A", correct_option: null }],
      },
    });
    const result = await getCorrectAnswers(admin, "eval1", ["q1"]);
    expect(result[0].question_type).toBe("single_choice");
  });

  it("data null: devuelve []", async () => {
    const admin = makeAdmin({ quiz_questions: { data: null } });
    const result = await getCorrectAnswers(admin, "eval1", ["q1"]);
    expect(result).toEqual([]);
  });
});
