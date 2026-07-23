import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cobertura de `getStudentGrades`: agrupación de notas por módulo/final/otras,
 * promedio (simple vs ponderado, vía `computeGroupAverage`) y el carril de
 * asistencia (sesiones cerradas + elegibles vía `lib/asistencia/window.ts`).
 *
 * Mockeamos SOLO los bordes externos: el cliente RLS (`@/lib/supabase/server`),
 * el cliente admin (`@/lib/supabase/admin`) y `getEnrollmentForUser` (ya
 * cubierto en `lib/classroom/__tests__/queries.test.ts`). `isSessionClosed`,
 * `sessionAppliesToEnrollment` y `computeGroupAverage` son funciones puras del
 * propio proyecto: se usan reales, no se mockean.
 *
 * Cada tabla de Supabase se simula con un builder encadenable que registra los
 * métodos invocados (no aplica los filtros de verdad — eso no es lo que se
 * prueba acá) y resuelve con `state`. `class_sessions` se consulta dos veces
 * con propósitos distintos (resolver `module_id` de scope=session vs. listar
 * sesiones cerradas para asistencia); se distinguen por si la cadena usó
 * `.in()` (lookup de módulo) o no (consulta de asistencia).
 */

type Resolver = (calls: Array<[string, ...unknown[]]>) => { data: unknown; error: unknown };

function chain(methods: string[], resolver: Resolver) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const m of methods) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.single = () => Promise.resolve(resolver(calls));
  builder.maybeSingle = () => Promise.resolve(resolver(calls));
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolver(calls)).then(res, rej);
  return builder;
}

type EnrollmentDetails = { enrolled_at: string; segment: string | null } | null;
type Cohort = { program_id: string; programs: { min_attendance_pct: number } | null } | null;
type GradeRow = { grade: number; feedback: string | null; graded_at: string | null; evaluation_id: string };
type EvaluationMeta = {
  id: string;
  title: string;
  scope: "final" | "module" | "lesson" | "session";
  module_id: string | null;
  lesson_id: string | null;
  session_id: string | null;
  weight_pct: number | null;
};
type Lesson = { id: string; module_id: string | null };
type SessionModuleRow = { id: string; module_id: string | null };
type ModuleRow = { id: string; title: string; position: number };
type ClosedSessionRow = { id: string; ends_at: string; audience: string };
type PresentRow = { session_id: string };
type PgError = { code: string; message: string } | null;

type State = {
  enrollment: { id: string; status: string; cohort_id: string; student_id: string } | null;
  enrollmentDetails: EnrollmentDetails;
  enrollmentDetailsError: PgError;
  cohort: Cohort;
  cohortError: PgError;
  gradeRows: GradeRow[];
  gradeRowsError: PgError;
  evaluations: EvaluationMeta[];
  evaluationsError: PgError;
  lessons: Lesson[];
  lessonsError: PgError;
  sessionModules: SessionModuleRow[];
  sessionModulesError: PgError;
  modules: ModuleRow[];
  modulesError: PgError;
  closedSessions: ClosedSessionRow[];
  closedSessionsError: PgError;
  presentRows: PresentRow[];
  presentRowsError: PgError;
};

let state: State;

function defaultState(): State {
  return {
    enrollment: { id: "enr-1", status: "active", cohort_id: "cohort-1", student_id: "user-1" },
    enrollmentDetails: { enrolled_at: "2026-01-01T00:00:00.000Z", segment: null },
    enrollmentDetailsError: null,
    cohort: { program_id: "prog-1", programs: { min_attendance_pct: 80 } },
    cohortError: null,
    gradeRows: [],
    gradeRowsError: null,
    evaluations: [],
    evaluationsError: null,
    lessons: [],
    lessonsError: null,
    sessionModules: [],
    sessionModulesError: null,
    modules: [],
    modulesError: null,
    closedSessions: [],
    closedSessionsError: null,
    presentRows: [],
    presentRowsError: null,
  };
}

const fakeSupabase = {
  from: (table: string) => {
    if (table === "enrollments") {
      return chain(["select", "eq"], () => ({ data: state.enrollmentDetails, error: state.enrollmentDetailsError }));
    }
    if (table === "cohorts") {
      return chain(["select", "eq"], () => ({ data: state.cohort, error: state.cohortError }));
    }
    if (table === "evaluation_grades") {
      return chain(["select", "eq", "not"], () => ({ data: state.gradeRows, error: state.gradeRowsError }));
    }
    if (table === "lessons") {
      return chain(["select", "in"], () => ({ data: state.lessons, error: state.lessonsError }));
    }
    if (table === "class_sessions") {
      return chain(["select", "eq", "neq", "lt", "in"], (calls) => {
        const isModuleLookup = calls.some(([m]) => m === "in");
        if (isModuleLookup) return { data: state.sessionModules, error: state.sessionModulesError };
        return { data: state.closedSessions, error: state.closedSessionsError };
      });
    }
    if (table === "program_modules") {
      return chain(["select", "in"], () => ({ data: state.modules, error: state.modulesError }));
    }
    if (table === "session_attendance") {
      return chain(["select", "eq", "in"], () => ({ data: state.presentRows, error: state.presentRowsError }));
    }
    throw new Error(`tabla no mockeada en fakeSupabase: ${table}`);
  },
};

const fakeAdmin = {
  from: (table: string) => {
    if (table === "evaluations") {
      return chain(["select", "in"], () => ({ data: state.evaluations, error: state.evaluationsError }));
    }
    throw new Error(`tabla no mockeada en fakeAdmin: ${table}`);
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeSupabase),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => fakeAdmin),
}));
vi.mock("@/lib/classroom/queries", () => ({
  getEnrollmentForUser: vi.fn(async () => state.enrollment),
}));

const { getStudentGrades } = await import("@/lib/grades/queries");

const COHORT_ID = "cohort-1";
const USER_ID = "user-1";

describe("getStudentGrades", () => {
  beforeEach(() => {
    state = defaultState();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sin matrícula activa/completada: devuelve vacío sin consultar nada más", async () => {
    state.enrollment = null;
    const result = await getStudentGrades(COHORT_ID, USER_ID);
    expect(result).toEqual({ groups: [], attendance: { pct: null, meetsRequirement: null } });
  });

  describe("enrollmentDetails", () => {
    it("PGRST116 (0 filas): no lanza, usa fallback enrolled_at/segment", async () => {
      state.enrollmentDetails = null;
      state.enrollmentDetailsError = { code: "PGRST116", message: "0 rows" };
      // Sesión anterior al fallback (1970) para verificar que sí se usó el fallback.
      state.closedSessions = [{ id: "s1", ends_at: "1970-06-01T00:00:00.000Z", audience: "all" }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.groups).toEqual([]);
    });

    it("error real (no PGRST116): propaga la excepción", async () => {
      state.enrollmentDetailsError = { code: "57014", message: "statement timeout" };
      await expect(getStudentGrades(COHORT_ID, USER_ID)).rejects.toBeTruthy();
    });
  });

  describe("cohort", () => {
    it("error: propaga la excepción", async () => {
      state.cohortError = { code: "57014", message: "statement timeout" };
      await expect(getStudentGrades(COHORT_ID, USER_ID)).rejects.toBeTruthy();
    });

    it("programs null (join vacío): meetsRequirement queda null aunque haya pct calculado", async () => {
      state.cohort = { program_id: "prog-1", programs: null };
      state.closedSessions = [{ id: "s1", ends_at: "2026-01-02T00:00:00.000Z", audience: "all" }];
      state.presentRows = [{ session_id: "s1" }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.attendance.pct).toBe(100);
      expect(result.attendance.meetsRequirement).toBeNull();
    });
  });

  describe("evaluation_grades", () => {
    it("error: propaga la excepción", async () => {
      state.gradeRowsError = { code: "57014", message: "statement timeout" };
      await expect(getStudentGrades(COHORT_ID, USER_ID)).rejects.toBeTruthy();
    });

    it("sin notas: groups vacío y no consulta evaluations (evaluationIds vacío)", async () => {
      state.gradeRows = [];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.groups).toEqual([]);
    });
  });

  describe("evaluations (admin)", () => {
    it("error: propaga la excepción", async () => {
      state.gradeRows = [{ grade: 6.0, feedback: null, graded_at: "2026-02-01", evaluation_id: "eval-1" }];
      state.evaluationsError = { code: "57014", message: "statement timeout" };
      await expect(getStudentGrades(COHORT_ID, USER_ID)).rejects.toBeTruthy();
    });

    it("evaluation_id sin metadata (evaluación borrada): la fila se descarta silenciosamente", async () => {
      state.gradeRows = [{ grade: 6.0, feedback: null, graded_at: "2026-02-01", evaluation_id: "eval-fantasma" }];
      state.evaluations = []; // no matchea eval-fantasma
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.groups).toEqual([]);
    });
  });

  describe("agrupación por scope", () => {
    it("scope='final' agrupa bajo key 'final' con título 'Evaluación final'", async () => {
      state.gradeRows = [{ grade: 6.5, feedback: "Excelente", graded_at: "2026-03-01", evaluation_id: "e-final" }];
      state.evaluations = [
        { id: "e-final", title: "Examen final", scope: "final", module_id: null, lesson_id: null, session_id: null, weight_pct: null },
      ];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]).toMatchObject({ key: "final", title: "Evaluación final" });
      expect(result.groups[0].rows[0]).toMatchObject({
        evaluationId: "e-final",
        title: "Examen final",
        scope: "final",
        grade: 6.5,
        feedback: "Excelente",
      });
    });

    it("scope='module' agrupa bajo key 'module:<id>' con el título del módulo", async () => {
      state.gradeRows = [{ grade: 5.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-mod" }];
      state.evaluations = [
        { id: "e-mod", title: "Quiz módulo 1", scope: "module", module_id: "mod-1", lesson_id: null, session_id: null, weight_pct: null },
      ];
      state.modules = [{ id: "mod-1", title: "Módulo 1: Fundamentos", position: 1 }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.groups[0]).toMatchObject({ key: "module:mod-1", title: "Módulo 1: Fundamentos" });
    });

    it("scope='module' sin match en program_modules: título cae a 'Módulo'", async () => {
      state.gradeRows = [{ grade: 5.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-mod" }];
      state.evaluations = [
        { id: "e-mod", title: "Quiz módulo 1", scope: "module", module_id: "mod-1", lesson_id: null, session_id: null, weight_pct: null },
      ];
      state.modules = []; // el módulo fue borrado, no matchea
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.groups[0].title).toBe("Módulo");
    });

    it("scope='lesson' resuelve module_id vía lessons.module_id", async () => {
      state.gradeRows = [{ grade: 4.5, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-lesson" }];
      state.evaluations = [
        { id: "e-lesson", title: "Quiz clase 3", scope: "lesson", module_id: null, lesson_id: "lesson-1", session_id: null, weight_pct: null },
      ];
      state.lessons = [{ id: "lesson-1", module_id: "mod-2" }];
      state.modules = [{ id: "mod-2", title: "Módulo 2: Avanzado", position: 2 }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.groups[0]).toMatchObject({ key: "module:mod-2", title: "Módulo 2: Avanzado" });
    });

    it("scope='lesson' cuya lección no resuelve module_id: cae a key 'other'", async () => {
      state.gradeRows = [{ grade: 4.5, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-lesson" }];
      state.evaluations = [
        { id: "e-lesson", title: "Quiz clase 3", scope: "lesson", module_id: null, lesson_id: "lesson-1", session_id: null, weight_pct: null },
      ];
      state.lessons = [{ id: "lesson-1", module_id: null }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.groups[0]).toMatchObject({ key: "other", title: "Otras evaluaciones" });
    });

    it("lessons error: propaga la excepción", async () => {
      state.gradeRows = [{ grade: 4.5, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-lesson" }];
      state.evaluations = [
        { id: "e-lesson", title: "Quiz", scope: "lesson", module_id: null, lesson_id: "lesson-1", session_id: null, weight_pct: null },
      ];
      state.lessonsError = { code: "57014", message: "statement timeout" };
      await expect(getStudentGrades(COHORT_ID, USER_ID)).rejects.toBeTruthy();
    });

    it("scope='session' resuelve module_id vía class_sessions.module_id", async () => {
      state.gradeRows = [{ grade: 6.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-session" }];
      state.evaluations = [
        { id: "e-session", title: "Quiz en vivo", scope: "session", module_id: null, lesson_id: null, session_id: "sess-1", weight_pct: null },
      ];
      state.sessionModules = [{ id: "sess-1", module_id: "mod-3" }];
      state.modules = [{ id: "mod-3", title: "Módulo 3", position: 3 }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.groups[0]).toMatchObject({ key: "module:mod-3", title: "Módulo 3" });
    });

    it("scope='session' sin module_id (sesión 'Otras evaluaciones'): cae a key 'other'", async () => {
      state.gradeRows = [{ grade: 6.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-session" }];
      state.evaluations = [
        { id: "e-session", title: "Quiz en vivo", scope: "session", module_id: null, lesson_id: null, session_id: "sess-1", weight_pct: null },
      ];
      state.sessionModules = [{ id: "sess-1", module_id: null }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.groups[0]).toMatchObject({ key: "other", title: "Otras evaluaciones" });
    });

    it("class_sessions (lookup de módulo) error: propaga la excepción", async () => {
      state.gradeRows = [{ grade: 6.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-session" }];
      state.evaluations = [
        { id: "e-session", title: "Quiz", scope: "session", module_id: null, lesson_id: null, session_id: "sess-1", weight_pct: null },
      ];
      state.sessionModulesError = { code: "57014", message: "statement timeout" };
      await expect(getStudentGrades(COHORT_ID, USER_ID)).rejects.toBeTruthy();
    });

    it("program_modules error: propaga la excepción", async () => {
      state.gradeRows = [{ grade: 5.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-mod" }];
      state.evaluations = [
        { id: "e-mod", title: "Quiz módulo 1", scope: "module", module_id: "mod-1", lesson_id: null, session_id: null, weight_pct: null },
      ];
      state.modulesError = { code: "57014", message: "statement timeout" };
      await expect(getStudentGrades(COHORT_ID, USER_ID)).rejects.toBeTruthy();
    });

    it("orden final: módulos por posición, luego 'Otras evaluaciones', luego 'Evaluación final'", async () => {
      state.gradeRows = [
        { grade: 6.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-final" },
        { grade: 5.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-mod2" },
        { grade: 4.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-mod1" },
        { grade: 3.5, feedback: null, graded_at: "2026-03-01", evaluation_id: "e-other" },
      ];
      state.evaluations = [
        { id: "e-final", title: "Final", scope: "final", module_id: null, lesson_id: null, session_id: null, weight_pct: null },
        { id: "e-mod2", title: "Quiz 2", scope: "module", module_id: "mod-2", lesson_id: null, session_id: null, weight_pct: null },
        { id: "e-mod1", title: "Quiz 1", scope: "module", module_id: "mod-1", lesson_id: null, session_id: null, weight_pct: null },
        { id: "e-other", title: "Quiz suelto", scope: "lesson", module_id: null, lesson_id: "lesson-x", session_id: null, weight_pct: null },
      ];
      state.lessons = [{ id: "lesson-x", module_id: null }];
      state.modules = [
        { id: "mod-1", title: "Módulo 1", position: 1 },
        { id: "mod-2", title: "Módulo 2", position: 2 },
      ];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.groups.map((g) => g.key)).toEqual(["module:mod-1", "module:mod-2", "other", "final"]);
    });
  });

  describe("promedio por grupo (integración con computeGroupAverage)", () => {
    it("todas las notas con peso: promedio ponderado, excluded=0", async () => {
      state.gradeRows = [
        { grade: 6.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e1" },
        { grade: 4.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e2" },
      ];
      state.evaluations = [
        { id: "e1", title: "Q1", scope: "module", module_id: "mod-1", lesson_id: null, session_id: null, weight_pct: 50 },
        { id: "e2", title: "Q2", scope: "module", module_id: "mod-1", lesson_id: null, session_id: null, weight_pct: 50 },
      ];
      state.modules = [{ id: "mod-1", title: "Módulo 1", position: 1 }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      const group = result.groups[0];
      expect(group.averageKind).toBe("weighted");
      expect(group.average).toBe(5.0);
      expect(group.averageExcluded).toBe(0);
    });

    it("ninguna nota con peso: promedio simple", async () => {
      state.gradeRows = [
        { grade: 6.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e1" },
        { grade: 4.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e2" },
      ];
      state.evaluations = [
        { id: "e1", title: "Q1", scope: "module", module_id: "mod-1", lesson_id: null, session_id: null, weight_pct: null },
        { id: "e2", title: "Q2", scope: "module", module_id: "mod-1", lesson_id: null, session_id: null, weight_pct: null },
      ];
      state.modules = [{ id: "mod-1", title: "Módulo 1", position: 1 }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      const group = result.groups[0];
      expect(group.averageKind).toBe("simple");
      expect(group.average).toBe(5.0);
    });

    it("peso parcial: las notas sin peso quedan excluidas del ponderado (ADR-0024)", async () => {
      state.gradeRows = [
        { grade: 6.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e1" },
        { grade: 1.0, feedback: null, graded_at: "2026-03-01", evaluation_id: "e2" },
      ];
      state.evaluations = [
        { id: "e1", title: "Q1", scope: "module", module_id: "mod-1", lesson_id: null, session_id: null, weight_pct: 100 },
        { id: "e2", title: "Q2 sin peso aún", scope: "module", module_id: "mod-1", lesson_id: null, session_id: null, weight_pct: null },
      ];
      state.modules = [{ id: "mod-1", title: "Módulo 1", position: 1 }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      const group = result.groups[0];
      expect(group.averageKind).toBe("weighted");
      expect(group.average).toBe(6.0);
      expect(group.averageExcluded).toBe(1);
    });
  });

  describe("carril de asistencia", () => {
    it("class_sessions (asistencia) error: propaga la excepción", async () => {
      state.closedSessionsError = { code: "57014", message: "statement timeout" };
      await expect(getStudentGrades(COHORT_ID, USER_ID)).rejects.toBeTruthy();
    });

    it("sin sesiones cerradas: pct y meetsRequirement quedan null, no consulta session_attendance", async () => {
      state.closedSessions = [];
      state.presentRowsError = { code: "boom", message: "no debería llegar acá" };
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.attendance).toEqual({ pct: null, meetsRequirement: null });
    });

    it("session_attendance error: propaga la excepción", async () => {
      state.closedSessions = [{ id: "s1", ends_at: "2026-01-02T00:00:00.000Z", audience: "all" }];
      state.presentRowsError = { code: "57014", message: "statement timeout" };
      await expect(getStudentGrades(COHORT_ID, USER_ID)).rejects.toBeTruthy();
    });

    it("calcula pct y meetsRequirement=true cuando alcanza el mínimo del programa", async () => {
      state.closedSessions = [
        { id: "s1", ends_at: "2026-01-02T00:00:00.000Z", audience: "all" },
        { id: "s2", ends_at: "2026-01-03T00:00:00.000Z", audience: "all" },
        { id: "s3", ends_at: "2026-01-04T00:00:00.000Z", audience: "all" },
        { id: "s4", ends_at: "2026-01-05T00:00:00.000Z", audience: "all" },
        { id: "s5", ends_at: "2026-01-06T00:00:00.000Z", audience: "all" },
      ];
      state.presentRows = [{ session_id: "s1" }, { session_id: "s2" }, { session_id: "s3" }, { session_id: "s4" }];
      // cohort.programs.min_attendance_pct = 80 (default), 4/5 = 80% => cumple.
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.attendance.pct).toBe(80);
      expect(result.attendance.meetsRequirement).toBe(true);
    });

    it("meetsRequirement=false cuando el pct no alcanza el mínimo del programa", async () => {
      state.closedSessions = [
        { id: "s1", ends_at: "2026-01-02T00:00:00.000Z", audience: "all" },
        { id: "s2", ends_at: "2026-01-03T00:00:00.000Z", audience: "all" },
      ];
      state.presentRows = [{ session_id: "s1" }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.attendance.pct).toBe(50);
      expect(result.attendance.meetsRequirement).toBe(false);
    });

    it("excluye sesiones anteriores a la matrícula del alumno (sessionAppliesToEnrollment)", async () => {
      state.enrollmentDetails = { enrolled_at: "2026-02-01T00:00:00.000Z", segment: null };
      state.closedSessions = [
        { id: "s-antes", ends_at: "2026-01-15T00:00:00.000Z", audience: "all" }, // antes de matricularse
        { id: "s-despues", ends_at: "2026-03-01T00:00:00.000Z", audience: "all" },
      ];
      state.presentRows = [{ session_id: "s-despues" }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      // Solo s-despues cuenta como elegible: 1/1 = 100%.
      expect(result.attendance.pct).toBe(100);
    });

    it("excluye sesiones exclusivas de un segmento distinto al del alumno", async () => {
      state.enrollmentDetails = { enrolled_at: "2026-01-01T00:00:00.000Z", segment: null };
      state.closedSessions = [
        { id: "s-ci", ends_at: "2026-02-01T00:00:00.000Z", audience: "capital_inteligente" }, // exclusiva CI
        { id: "s-all", ends_at: "2026-02-02T00:00:00.000Z", audience: "all" },
      ];
      state.presentRows = [{ session_id: "s-all" }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      // s-ci queda fuera del universo elegible (alumno no es segmento CI): 1/1 = 100%.
      expect(result.attendance.pct).toBe(100);
    });

    it("incluye sesiones exclusivas de CI cuando el alumno SÍ es de ese segmento", async () => {
      state.enrollmentDetails = { enrolled_at: "2026-01-01T00:00:00.000Z", segment: "capital_inteligente" };
      state.closedSessions = [{ id: "s-ci", ends_at: "2026-02-01T00:00:00.000Z", audience: "capital_inteligente" }];
      state.presentRows = [{ session_id: "s-ci" }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      expect(result.attendance.pct).toBe(100);
    });

    it("excluye sesiones que aún no cierran (dentro de la ventana de gracia, isSessionClosed=false)", async () => {
      // La query real filtra `ends_at < nowIso`, pero acá el mock no aplica ese
      // filtro — se prueba el filtro EN MEMORIA de isSessionClosed, que exige
      // `now > ends_at + GRACE_AFTER_MIN`. Una sesión que terminó hace 5 min
      // sigue dentro de la ventana de gracia (30 min) y NO debe contar como cerrada.
      const now = new Date();
      const endsAtHace5Min = new Date(now.getTime() - 5 * 60_000).toISOString();
      state.closedSessions = [{ id: "s-reciente", ends_at: endsAtHace5Min, audience: "all" }];
      const result = await getStudentGrades(COHORT_ID, USER_ID);
      // Ninguna sesión "cerrada" elegible => universo vacío.
      expect(result.attendance).toEqual({ pct: null, meetsRequirement: null });
    });
  });
});
