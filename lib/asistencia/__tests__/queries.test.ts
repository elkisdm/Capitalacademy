import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cubre `getSessionAttendance`, `markManualAttendance`, `bulkSetAttendance` y
 * `unmarkAttendance` de `lib/asistencia/queries.ts`.
 *
 * `getStudentsAtAbsenceThreshold` ya está cubierta en
 * `lib/asistencia/__tests__/absence-threshold.test.ts` — no se repite acá.
 *
 * Mock mínimo del query builder de supabase-js: cada tabla es un array en
 * memoria compartido entre llamadas (varias funciones del módulo hacen más
 * de un `createAdminClient()` dentro del mismo flujo, p.ej. `bulkSetAttendance`
 * llama a `getSessionAttendance` al final), así que `upsert`/`delete` mutan
 * el estado de verdad en vez de solo registrar llamadas.
 */

type Row = Record<string, unknown>;
type DB = Record<string, Row[]>;

let currentAdmin: { from: (table: string) => unknown };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => currentAdmin,
}));

const { getSessionAttendance, markManualAttendance, bulkSetAttendance, unmarkAttendance } =
  await import("@/lib/asistencia/queries");

function makeAdmin(db: DB, opts: { upsertError?: boolean; deleteError?: boolean } = {}) {
  function from(table: string) {
    let rows = [...(db[table] ?? [])];
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return builder;
      },
      neq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] !== val);
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return builder;
      },
      single: async () => ({ data: rows[0] ?? null }),
      maybeSingle: async () => ({ data: rows[0] ?? null }),
      then: (resolve: (v: { data: Row[] }) => void) => resolve({ data: rows }),
      upsert: async (
        payload: Row | Row[],
        upsertOpts: { onConflict: string; ignoreDuplicates?: boolean },
      ) => {
        if (opts.upsertError) return { error: { message: "boom" } };
        const list = Array.isArray(payload) ? payload : [payload];
        const conflictCols = upsertOpts.onConflict.split(",");
        const target = db[table];
        for (const row of list) {
          const existingIdx = target.findIndex((r) =>
            conflictCols.every((c) => r[c] === row[c]),
          );
          if (existingIdx >= 0) {
            if (!upsertOpts.ignoreDuplicates) {
              target[existingIdx] = { ...target[existingIdx], ...row };
            }
          } else {
            target.push({ ...row });
          }
        }
        return { error: null };
      },
      delete: () => {
        let predicate = (_r: Row) => true;
        const delBuilder: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            const prev = predicate;
            predicate = (r: Row) => prev(r) && r[col] === val;
            return delBuilder;
          },
          in: (col: string, vals: unknown[]) => {
            const prev = predicate;
            predicate = (r: Row) => prev(r) && vals.includes(r[col]);
            return delBuilder;
          },
          then: (resolve: (v: { error: unknown }) => void) => {
            if (opts.deleteError) return resolve({ error: { message: "boom" } });
            db[table] = db[table].filter((r) => !predicate(r));
            return resolve({ error: null });
          },
        };
        return delBuilder;
      },
    };
    return builder;
  }
  return { from };
}

const SESSION_ID = "session-1";
const COHORT_ID = "cohort-1";

function baseDb(): DB {
  return {
    class_sessions: [{ id: SESSION_ID, cohort_id: COHORT_ID, title: "Clase 1" }],
    enrollments: [],
    session_attendance: [],
  };
}

describe("getSessionAttendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve null si la sesión no existe", async () => {
    currentAdmin = makeAdmin({ class_sessions: [], enrollments: [], session_attendance: [] });

    const result = await getSessionAttendance("no-existe");

    expect(result).toBeNull();
  });

  it("arma el reporte con matriculados activos, marca asistencia y ordena por nombre/email", async () => {
    const db = baseDb();
    db.enrollments = [
      {
        student_id: "s-ana",
        cohort_id: COHORT_ID,
        status: "active",
        profiles: { full_name: "Ana Torres", email: "ana@example.com" },
      },
      {
        student_id: "s-beatriz",
        cohort_id: COHORT_ID,
        status: "active",
        profiles: { full_name: "Beatriz Soto", email: "beatriz@example.com" },
      },
      {
        student_id: "s-sin-nombre",
        cohort_id: COHORT_ID,
        status: "active",
        profiles: { full_name: null, email: "zzz@example.com" },
      },
      // Matrícula inactiva: no debe entrar al reporte.
      {
        student_id: "s-retirado",
        cohort_id: COHORT_ID,
        status: "withdrawn",
        profiles: { full_name: "Retirado Alumno", email: "retirado@example.com" },
      },
    ];
    db.session_attendance = [
      {
        session_id: SESSION_ID,
        student_id: "s-ana",
        method: "qr",
        marked_at: "2026-07-01T10:00:00.000Z",
      },
    ];
    currentAdmin = makeAdmin(db);

    const result = await getSessionAttendance(SESSION_ID);

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe(SESSION_ID);
    expect(result?.cohortId).toBe(COHORT_ID);
    expect(result?.title).toBe("Clase 1");
    expect(result?.total).toBe(3);
    expect(result?.present).toBe(1);
    // Orden alfabético: Ana, Beatriz, y la sin nombre (por email "zzz...") al final.
    expect(result?.rows.map((r) => r.studentId)).toEqual(["s-ana", "s-beatriz", "s-sin-nombre"]);
    expect(result?.rows[0]).toEqual({
      studentId: "s-ana",
      fullName: "Ana Torres",
      email: "ana@example.com",
      attended: true,
      method: "qr",
      markedAt: "2026-07-01T10:00:00.000Z",
    });
    expect(result?.rows[1]).toMatchObject({ studentId: "s-beatriz", attended: false, method: null });
  });

  it("sin matriculados activos devuelve rows vacío y total/present en 0", async () => {
    const db = baseDb();
    currentAdmin = makeAdmin(db);

    const result = await getSessionAttendance(SESSION_ID);

    expect(result?.total).toBe(0);
    expect(result?.present).toBe(0);
    expect(result?.rows).toEqual([]);
  });
});

describe("markManualAttendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("error si la sesión no existe", async () => {
    currentAdmin = makeAdmin({ class_sessions: [], enrollments: [], session_attendance: [] });

    const result = await markManualAttendance("no-existe", "s-1", "staff-1");

    expect(result).toEqual({ ok: false, error: "Sesión no encontrada." });
  });

  it("error si el alumno no está matriculado activo en la cohorte de la sesión", async () => {
    const db = baseDb();
    db.enrollments = [
      { student_id: "s-1", cohort_id: COHORT_ID, status: "withdrawn" },
    ];
    currentAdmin = makeAdmin(db);

    const result = await markManualAttendance(SESSION_ID, "s-1", "staff-1");

    expect(result).toEqual({
      ok: false,
      error: "El alumno no está matriculado en esta clase.",
    });
  });

  it("error si el upsert falla en la base de datos", async () => {
    const db = baseDb();
    db.enrollments = [{ student_id: "s-1", cohort_id: COHORT_ID, status: "active" }];
    currentAdmin = makeAdmin(db, { upsertError: true });

    const result = await markManualAttendance(SESSION_ID, "s-1", "staff-1");

    expect(result).toEqual({ ok: false, error: "No se pudo marcar la asistencia." });
  });

  it("marca la asistencia con method='manual' cuando el alumno está matriculado activo", async () => {
    const db = baseDb();
    db.enrollments = [{ student_id: "s-1", cohort_id: COHORT_ID, status: "active" }];
    currentAdmin = makeAdmin(db);

    const result = await markManualAttendance(SESSION_ID, "s-1", "staff-1");

    expect(result).toEqual({ ok: true });
    expect(db.session_attendance).toEqual([
      {
        session_id: SESSION_ID,
        student_id: "s-1",
        cohort_id: COHORT_ID,
        method: "manual",
        marked_by: "staff-1",
      },
    ]);
  });

  it("es idempotente: si ya tenía asistencia (qr o manual) no la duplica ni la pisa", async () => {
    const db = baseDb();
    db.enrollments = [{ student_id: "s-1", cohort_id: COHORT_ID, status: "active" }];
    db.session_attendance = [
      {
        session_id: SESSION_ID,
        student_id: "s-1",
        cohort_id: COHORT_ID,
        method: "qr",
        marked_by: null,
      },
    ];
    currentAdmin = makeAdmin(db);

    const result = await markManualAttendance(SESSION_ID, "s-1", "staff-1");

    expect(result).toEqual({ ok: true });
    // ignoreDuplicates: la fila 'qr' original queda intacta, no se pisa con 'manual'.
    expect(db.session_attendance).toHaveLength(1);
    expect(db.session_attendance[0].method).toBe("qr");
  });
});

describe("bulkSetAttendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("error si la sesión no existe", async () => {
    currentAdmin = makeAdmin({ class_sessions: [], enrollments: [], session_attendance: [] });

    const result = await bulkSetAttendance("no-existe", ["s-1"], true, "staff-1");

    expect(result).toEqual({ ok: false, error: "Sesión no encontrada." });
  });

  it("attended=true: marca solo a los alumnos con matrícula activa y descarta los demás", async () => {
    const db = baseDb();
    db.enrollments = [
      { student_id: "s-1", cohort_id: COHORT_ID, status: "active" },
      { student_id: "s-2", cohort_id: COHORT_ID, status: "active" },
      // s-3 no está matriculado en esta cohorte: debe quedar fuera.
    ];
    currentAdmin = makeAdmin(db);

    const result = await bulkSetAttendance(SESSION_ID, ["s-1", "s-2", "s-3"], true, "staff-1");

    expect(result.ok).toBe(true);
    expect(result.report?.present).toBe(2);
    const markedIds = db.session_attendance.map((r) => r.student_id).sort();
    expect(markedIds).toEqual(["s-1", "s-2"]);
  });

  it("attended=true: si ningún studentId tiene matrícula activa, no hace upsert y el reporte queda sin marcas", async () => {
    const db = baseDb();
    db.enrollments = [{ student_id: "s-1", cohort_id: COHORT_ID, status: "active" }];
    currentAdmin = makeAdmin(db);

    const result = await bulkSetAttendance(SESSION_ID, ["s-otro"], true, "staff-1");

    expect(result.ok).toBe(true);
    expect(db.session_attendance).toEqual([]);
    expect(result.report?.present).toBe(0);
  });

  it("attended=true: error si el upsert en lote falla", async () => {
    const db = baseDb();
    db.enrollments = [{ student_id: "s-1", cohort_id: COHORT_ID, status: "active" }];
    currentAdmin = makeAdmin(db, { upsertError: true });

    const result = await bulkSetAttendance(SESSION_ID, ["s-1"], true, "staff-1");

    expect(result).toEqual({ ok: false, error: "No se pudo marcar la asistencia." });
  });

  it("attended=false: quita la asistencia de los alumnos indicados", async () => {
    const db = baseDb();
    db.enrollments = [
      { student_id: "s-1", cohort_id: COHORT_ID, status: "active" },
      { student_id: "s-2", cohort_id: COHORT_ID, status: "active" },
    ];
    db.session_attendance = [
      { session_id: SESSION_ID, student_id: "s-1", cohort_id: COHORT_ID, method: "qr" },
      { session_id: SESSION_ID, student_id: "s-2", cohort_id: COHORT_ID, method: "manual" },
    ];
    currentAdmin = makeAdmin(db);

    const result = await bulkSetAttendance(SESSION_ID, ["s-1"], false, "staff-1");

    expect(result.ok).toBe(true);
    expect(db.session_attendance.map((r) => r.student_id)).toEqual(["s-2"]);
    expect(result.report?.present).toBe(1);
  });

  it("attended=false: error si el delete en lote falla", async () => {
    const db = baseDb();
    db.enrollments = [{ student_id: "s-1", cohort_id: COHORT_ID, status: "active" }];
    db.session_attendance = [
      { session_id: SESSION_ID, student_id: "s-1", cohort_id: COHORT_ID, method: "qr" },
    ];
    currentAdmin = makeAdmin(db, { deleteError: true });

    const result = await bulkSetAttendance(SESSION_ID, ["s-1"], false, "staff-1");

    expect(result).toEqual({ ok: false, error: "No se pudo quitar la asistencia." });
  });
});

describe("unmarkAttendance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("quita la asistencia del alumno indicado en la sesión", async () => {
    const db = baseDb();
    db.session_attendance = [
      { session_id: SESSION_ID, student_id: "s-1", cohort_id: COHORT_ID, method: "manual" },
      { session_id: SESSION_ID, student_id: "s-2", cohort_id: COHORT_ID, method: "qr" },
    ];
    currentAdmin = makeAdmin(db);

    const result = await unmarkAttendance(SESSION_ID, "s-1");

    expect(result).toEqual({ ok: true });
    expect(db.session_attendance.map((r) => r.student_id)).toEqual(["s-2"]);
  });

  it("error si falla el delete en la base de datos", async () => {
    const db = baseDb();
    currentAdmin = makeAdmin(db, { deleteError: true });

    const result = await unmarkAttendance(SESSION_ID, "s-1");

    expect(result).toEqual({ ok: false, error: "No se pudo quitar la asistencia." });
  });
});
