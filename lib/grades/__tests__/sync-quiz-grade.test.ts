import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncQuizGrade } from "@/lib/grades/sync-quiz-grade";
import { pctToGrade } from "@/lib/grades/scale";

/**
 * Cobertura mínima del camino de escritura más crítico del módulo de notas
 * (corrección M6 de la revisión): publica la nota del mejor intento, nunca
 * pisa una nota 'manual'/'import', y el error no se traga en silencio.
 *
 * El mock de `evaluation_grades` (corrección M6, endurecido) es un store en
 * memoria (`state.gradeRows`) que aplica de verdad los `.eq()` encadenados
 * antes de devolver/mutar filas — no solo ramifica por `hasOp("update")` /
 * `hasOp("insert")` como la versión anterior. Eso es lo que permite que el
 * fixture "no pisa una nota manual" falle si alguien borra
 * `.eq("source","quiz")` de `sync-quiz-grade.ts`: sin ese filtro, el UPDATE
 * matchearía la fila 'manual' por (evaluation_id, enrollment_id) y la
 * pisaría, en vez de chocar con el unique en el INSERT subsiguiente.
 */

type GradeRow = {
  id: string;
  evaluation_id: string;
  enrollment_id: string;
  source: string;
  grade: number | null;
  score_pct: number | null;
  quiz_attempt_id: string | null;
  published_at: string | null;
};

type State = {
  attempts: Array<{ id: string; score_pct: number | null }> | null;
  program: { grade_exigencia_pct: number } | null;
  gradeRows: GradeRow[];
  updateError: { code: string; message: string } | null;
  insertError: { code: string; message: string } | null;
  insertCalls: Array<Record<string, unknown>>;
  updateCalls: Array<Record<string, unknown>>;
};
let state: State;

function makeSimpleBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "not", "order", "limit"]) {
    builder[m] = () => builder;
  }
  const resolve = () => {
    if (table === "quiz_attempts") return { data: state.attempts, error: null };
    if (table === "programs") return { data: state.program, error: state.program ? null : {} };
    return { data: null, error: null };
  };
  builder.single = () => Promise.resolve(resolve());
  builder.maybeSingle = () => Promise.resolve(resolve());
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return builder;
}

/**
 * Builder de `evaluation_grades` que opera sobre `state.gradeRows` de verdad:
 * registra cada `.eq(col, val)` de la cadena y, al resolver, filtra las filas
 * que matchean TODOS los `.eq()` acumulados — igual que haría Postgres.
 */
function makeGradesBuilder() {
  const eqFilters: Array<[string, unknown]> = [];
  let op: "update" | "insert" | null = null;
  let payload: Record<string, unknown> | null = null;

  const builder: Record<string, unknown> = {};
  builder.eq = (col: string, val: unknown) => {
    eqFilters.push([col, val]);
    return builder;
  };
  builder.select = () => builder;
  builder.update = (p: Record<string, unknown>) => {
    op = "update";
    payload = p;
    return builder;
  };
  builder.insert = (p: Record<string, unknown>) => {
    op = "insert";
    payload = p;
    return builder;
  };

  const resolve = () => {
    if (op === "update") {
      state.updateCalls.push(payload!);
      if (state.updateError) return { data: null, error: state.updateError };
      const matches = state.gradeRows.filter((r) =>
        eqFilters.every(([col, val]) => (r as Record<string, unknown>)[col] === val),
      );
      for (const row of matches) Object.assign(row, payload);
      return { data: matches.map((r) => ({ id: r.id })), error: null };
    }
    if (op === "insert") {
      state.insertCalls.push(payload!);
      if (state.insertError) return { error: state.insertError };
      const conflict = state.gradeRows.some(
        (r) => r.evaluation_id === payload!.evaluation_id && r.enrollment_id === payload!.enrollment_id,
      );
      if (conflict) {
        return {
          error: { code: "23505", message: "duplicate key value violates unique constraint" },
        };
      }
      state.gradeRows.push({
        id: `new-${state.gradeRows.length}`,
        evaluation_id: payload!.evaluation_id as string,
        enrollment_id: payload!.enrollment_id as string,
        source: payload!.source as string,
        grade: (payload!.grade as number) ?? null,
        score_pct: (payload!.score_pct as number) ?? null,
        quiz_attempt_id: (payload!.quiz_attempt_id as string) ?? null,
        published_at: (payload!.published_at as string) ?? null,
      });
      return { error: null };
    }
    return { data: null, error: null };
  };

  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return builder;
}

const fakeAdmin = {
  from: (table: string) => (table === "evaluation_grades" ? makeGradesBuilder() : makeSimpleBuilder(table)),
} as unknown as Parameters<typeof syncQuizGrade>[0];

const EVALUATION_ID = "eval-1";
const PROGRAM_ID = "program-1";
const ENROLLMENT_ID = "enr-1";

describe("syncQuizGrade", () => {
  beforeEach(() => {
    state = {
      // Mejor intento (90) NO es ni el primero ni el último, para que un
      // "reduce ingenuo" por posición no pase el test por accidente.
      attempts: [
        { id: "attempt-low", score_pct: 50 },
        { id: "attempt-best", score_pct: 90 },
        { id: "attempt-mid", score_pct: 70 },
      ],
      program: { grade_exigencia_pct: 60 },
      gradeRows: [],
      updateError: null,
      insertError: null,
      insertCalls: [],
      updateCalls: [],
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("publica la nota del MEJOR intento completado (B4)", async () => {
    await syncQuizGrade(fakeAdmin, {
      evaluationId: EVALUATION_ID,
      programId: PROGRAM_ID,
      enrollmentId: ENROLLMENT_ID,
    });

    expect(state.insertCalls).toHaveLength(1);
    const inserted = state.insertCalls[0];
    expect(inserted.quiz_attempt_id).toBe("attempt-best");
    expect(inserted.score_pct).toBe(90);
    expect(inserted.grade).toBe(pctToGrade(90, 60));
    expect(inserted.source).toBe("quiz");
    expect(inserted.published_at).toEqual(expect.any(String));
  });

  it("actualiza en vez de insertar cuando ya existe una fila source='quiz'", async () => {
    state.gradeRows = [
      {
        id: "grade-1",
        evaluation_id: EVALUATION_ID,
        enrollment_id: ENROLLMENT_ID,
        source: "quiz",
        grade: 4.0,
        score_pct: 60,
        quiz_attempt_id: "attempt-old",
        published_at: "2020-01-01T00:00:00.000Z",
      },
    ];

    await syncQuizGrade(fakeAdmin, {
      evaluationId: EVALUATION_ID,
      programId: PROGRAM_ID,
      enrollmentId: ENROLLMENT_ID,
    });

    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].quiz_attempt_id).toBe("attempt-best");
    // No insert: el UPDATE ya afectó una fila.
    expect(state.insertCalls).toHaveLength(0);
    expect(state.gradeRows[0].quiz_attempt_id).toBe("attempt-best");
    expect(state.gradeRows[0].score_pct).toBe(90);
  });

  it("NO pisa una nota 'manual' existente: sobrevive intacta y el conflicto del insert se descarta en silencio (M2)", async () => {
    state.gradeRows = [
      {
        id: "manual-1",
        evaluation_id: EVALUATION_ID,
        enrollment_id: ENROLLMENT_ID,
        source: "manual",
        grade: 5.5,
        score_pct: null,
        quiz_attempt_id: null,
        published_at: "2020-01-01T00:00:00.000Z",
      },
    ];

    await expect(
      syncQuizGrade(fakeAdmin, {
        evaluationId: EVALUATION_ID,
        programId: PROGRAM_ID,
        enrollmentId: ENROLLMENT_ID,
      }),
    ).resolves.toBeUndefined();

    // La fila manual queda exactamente igual: el UPDATE (acotado a
    // source='quiz') no la tocó, y el INSERT chocó con el unique (23505) y
    // se descartó en silencio (mismo resultado que "nunca pisar").
    expect(state.gradeRows).toHaveLength(1);
    expect(state.gradeRows[0]).toMatchObject({
      source: "manual",
      grade: 5.5,
      quiz_attempt_id: null,
      published_at: "2020-01-01T00:00:00.000Z",
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("propaga un error real del INSERT en vez de tragárselo en silencio", async () => {
    state.insertError = { code: "42501", message: "permission denied" };

    await syncQuizGrade(fakeAdmin, {
      evaluationId: EVALUATION_ID,
      programId: PROGRAM_ID,
      enrollmentId: ENROLLMENT_ID,
    });

    // El catch general SÍ registra el error (no revienta el submit del
    // alumno), pero queda visible en consola en vez de desaparecer del todo.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("syncQuizGrade falló"),
      expect.anything(),
    );
  });

  it("propaga un error real del UPDATE en vez de tratarlo como 'cero filas' (bloqueante 2)", async () => {
    // Sin fix: `updated` queda `null`/vacío indistinguible de "no había
    // fila", el flujo cae al INSERT (que acá SÍ tendría éxito porque
    // gradeRows está vacío) y el error real del UPDATE desaparece sin rastro.
    state.updateError = { code: "42501", message: "permission denied" };

    await syncQuizGrade(fakeAdmin, {
      evaluationId: EVALUATION_ID,
      programId: PROGRAM_ID,
      enrollmentId: ENROLLMENT_ID,
    });

    expect(state.insertCalls).toHaveLength(0);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("syncQuizGrade falló"),
      expect.anything(),
    );
  });

  it("no escribe nada si no hay intentos completados", async () => {
    state.attempts = [];

    await syncQuizGrade(fakeAdmin, {
      evaluationId: EVALUATION_ID,
      programId: PROGRAM_ID,
      enrollmentId: ENROLLMENT_ID,
    });

    expect(state.updateCalls).toHaveLength(0);
    expect(state.insertCalls).toHaveLength(0);
  });
});
