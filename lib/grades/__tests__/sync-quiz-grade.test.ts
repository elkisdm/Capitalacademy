import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncQuizGrade } from "@/lib/grades/sync-quiz-grade";
import { pctToGrade } from "@/lib/grades/scale";

/**
 * Cobertura mínima del camino de escritura más crítico del módulo de notas
 * (corrección M6 de la revisión): publica la nota del mejor intento, nunca
 * pisa una nota 'manual'/'import', y el error no se traga en silencio.
 */

type State = {
  attempts: Array<{ id: string; score_pct: number | null }> | null;
  program: { grade_exigencia_pct: number } | null;
  updatedRows: Array<{ id: string }> | null;
  insertError: { code: string; message: string } | null;
  insertCalls: Array<Record<string, unknown>>;
  updateCalls: Array<Record<string, unknown>>;
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
  const hasOp = (name: string) => ops.some(([mm]) => mm === name);
  const argsFor = (name: string) => ops.find(([mm]) => mm === name)?.[1];

  const resolve = () => {
    if (table === "quiz_attempts") return { data: state.attempts, error: null };
    if (table === "programs") return { data: state.program, error: state.program ? null : {} };
    if (table === "evaluation_grades") {
      if (hasOp("update")) {
        state.updateCalls.push(argsFor("update")![0] as Record<string, unknown>);
        return { data: state.updatedRows, error: null };
      }
      if (hasOp("insert")) {
        state.insertCalls.push(argsFor("insert")![0] as Record<string, unknown>);
        return { error: state.insertError };
      }
    }
    return { data: null, error: null };
  };
  builder.single = () => Promise.resolve(resolve());
  builder.maybeSingle = () => Promise.resolve(resolve());
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return builder;
}

const fakeAdmin = { from: (table: string) => makeBuilder(table) } as unknown as Parameters<
  typeof syncQuizGrade
>[0];

const EVALUATION_ID = "eval-1";
const PROGRAM_ID = "program-1";
const ENROLLMENT_ID = "enr-1";

describe("syncQuizGrade", () => {
  beforeEach(() => {
    state = {
      attempts: [
        { id: "attempt-low", score_pct: 50 },
        { id: "attempt-best", score_pct: 90 },
      ],
      program: { grade_exigencia_pct: 60 },
      updatedRows: [],
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
    state.updatedRows = [{ id: "grade-1" }];

    await syncQuizGrade(fakeAdmin, {
      evaluationId: EVALUATION_ID,
      programId: PROGRAM_ID,
      enrollmentId: ENROLLMENT_ID,
    });

    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].quiz_attempt_id).toBe("attempt-best");
    // No insert: el UPDATE ya afectó una fila.
    expect(state.insertCalls).toHaveLength(0);
  });

  it("NO pisa una nota 'manual'/'import' (M2): conflicto de unique en el insert se descarta en silencio", async () => {
    // El UPDATE acotado a source='quiz' no afecta filas porque la fila
    // existente es 'manual' o 'import'; el INSERT subsiguiente choca con el
    // unique (evaluation_id, enrollment_id) → 23505, que debe descartarse sin
    // lanzar ni bloquear el flujo (mismo resultado que "nunca pisar").
    state.updatedRows = [];
    state.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };

    await expect(
      syncQuizGrade(fakeAdmin, {
        evaluationId: EVALUATION_ID,
        programId: PROGRAM_ID,
        enrollmentId: ENROLLMENT_ID,
      }),
    ).resolves.toBeUndefined();

    expect(console.error).not.toHaveBeenCalled();
  });

  it("no traga en silencio un error real: se registra en consola (best-effort documentado)", async () => {
    state.updatedRows = [];
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
