import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cobertura de `getStudentPanelReport`: alcance de cohortes (filtro válido,
 * inválido, ausente, sin cohortes en el programa), asistencia (sesiones
 * cerradas + elegibles vía `lib/asistencia/window.ts`), avance de lecciones
 * completables y evaluaciones aprobadas/pendientes, más los fallbacks de
 * presentación (nombre, iniciales, nombre de cohorte).
 *
 * Se mockea SOLO el borde externo: `createAdminClient`
 * (`@/lib/supabase/admin`). `isSessionClosed` y `sessionAppliesToEnrollment`
 * son funciones puras del propio proyecto (`lib/asistencia/window.ts`): se
 * usan reales, no se mockean.
 *
 * Cada tabla se simula con un builder encadenable que registra los métodos y
 * argumentos invocados (`capturedCalls[table]`) — permite verificar que el
 * filtro de cohortes (`scopeCohortIds`) se arma bien y que las consultas
 * condicionadas (session_attendance, lessons, video_progress, quiz_attempts)
 * NO se disparan cuando su precondición está vacía (`calledTables`).
 */

type Resolver = () => { data: unknown; error?: unknown };

const calledTables: string[] = [];
const capturedCalls: Record<string, Array<[string, ...unknown[]]>> = {};

function chain(table: string, methods: string[], resolver: Resolver) {
  const calls: Array<[string, ...unknown[]]> = [];
  capturedCalls[table] = calls;
  const builder: Record<string, unknown> = {};
  for (const m of methods) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.single = () => Promise.resolve(resolver());
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolver()).then(res, rej);
  return builder;
}

type Program = { id: string; name: string } | null;
type Cohort = { id: string; name: string; code: string };
type Profile = { full_name: string | null; email: string | null } | null;
type Enrollment = {
  id: string;
  student_id: string;
  cohort_id: string;
  segment: string | null;
  enrolled_at: string;
  profiles: Profile;
};
type SessionRow = {
  id: string;
  cohort_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  audience: string;
};
type AttendanceRow = { session_id: string; student_id: string };
type ModuleRow = { id: string; title: string; position: number };
type LessonRow = { id: string; module_id: string; title: string; mux_playback_id: string | null };
type VideoProgressRow = { enrollment_id: string; lesson_id: string; completed: boolean | null };
type EvaluationRow = { id: string; title: string; scope: string };
type QuizAttemptRow = { evaluation_id: string | null; enrollment_id: string };

type State = {
  program: Program;
  cohorts: Cohort[];
  enrollments: Enrollment[];
  sessions: SessionRow[];
  attendance: AttendanceRow[];
  modules: ModuleRow[];
  lessons: LessonRow[];
  videoProgress: VideoProgressRow[];
  evaluations: EvaluationRow[];
  quizAttempts: QuizAttemptRow[];
  errors: Partial<Record<string, { code: string; message: string }>>;
};

let state: State;

function defaultState(): State {
  return {
    program: { id: "prog-1", name: "Programa X" },
    cohorts: [{ id: "cohort-1", name: "Cohorte A", code: "G1" }],
    enrollments: [
      {
        id: "enr-1",
        student_id: "stu-1",
        cohort_id: "cohort-1",
        segment: null,
        enrolled_at: "2026-01-01T00:00:00.000Z",
        profiles: { full_name: "Juan Pérez", email: "juan@x.cl" },
      },
    ],
    sessions: [],
    attendance: [],
    modules: [],
    lessons: [],
    videoProgress: [],
    evaluations: [],
    quizAttempts: [],
    errors: {},
  };
}

/** Si `state.errors[table]` está seteado, la consulta responde error en vez de datos (simula un fallo real del proveedor, p. ej. timeout 57014 o RLS). */
function withError<T>(table: string, data: T): { data: T | null; error: { code: string; message: string } | null } {
  const error = state.errors[table];
  return error ? { data: null, error } : { data, error: null };
}

const fakeAdmin = {
  from: (table: string) => {
    calledTables.push(table);
    if (table === "programs") {
      return chain(table, ["select", "eq"], () => withError(table, state.program));
    }
    if (table === "cohorts") {
      return chain(table, ["select", "eq", "order"], () => withError(table, state.cohorts));
    }
    if (table === "enrollments") {
      return chain(table, ["select", "in", "eq"], () => withError(table, state.enrollments));
    }
    if (table === "class_sessions") {
      return chain(table, ["select", "in", "neq", "lt"], () => withError(table, state.sessions));
    }
    if (table === "session_attendance") {
      return chain(table, ["select", "in"], () => withError(table, state.attendance));
    }
    if (table === "program_modules") {
      return chain(table, ["select", "eq", "order"], () => withError(table, state.modules));
    }
    if (table === "lessons") {
      return chain(table, ["select", "in"], () => withError(table, state.lessons));
    }
    if (table === "video_progress") {
      return chain(table, ["select", "in"], () => withError(table, state.videoProgress));
    }
    if (table === "evaluations") {
      return chain(table, ["select", "eq"], () => withError(table, state.evaluations));
    }
    if (table === "quiz_attempts") {
      return chain(table, ["select", "in", "eq"], () => withError(table, state.quizAttempts));
    }
    throw new Error(`tabla no mockeada en fakeAdmin: ${table}`);
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => fakeAdmin),
}));

const { getStudentPanelReport } = await import("@/lib/admin/student-panel-queries");

const PROGRAM_ID = "prog-1";

describe("getStudentPanelReport", () => {
  beforeEach(() => {
    state = defaultState();
    calledTables.length = 0;
    for (const k of Object.keys(capturedCalls)) delete capturedCalls[k];
  });

  describe("programa", () => {
    it("no existe: devuelve null y no consulta cohortes/enrollments", async () => {
      state.program = null;
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result).toBeNull();
      expect(calledTables).toEqual(["programs"]);
    });
  });

  describe("alcance de cohortes (scopeCohortIds)", () => {
    it("sin cohortId: usa TODOS los cohortes del programa", async () => {
      state.cohorts = [
        { id: "cohort-1", name: "Cohorte A", code: "G1" },
        { id: "cohort-2", name: "Cohorte B", code: "G2" },
      ];
      state.enrollments = [];
      await getStudentPanelReport(PROGRAM_ID);
      const inCall = capturedCalls["enrollments"].find(([m]) => m === "in");
      expect(inCall?.[2]).toEqual(["cohort-1", "cohort-2"]);
    });

    it("cohortId válido (pertenece al programa): acota el alcance a ese único cohorte", async () => {
      state.cohorts = [
        { id: "cohort-1", name: "Cohorte A", code: "G1" },
        { id: "cohort-2", name: "Cohorte B", code: "G2" },
      ];
      state.enrollments = [];
      await getStudentPanelReport(PROGRAM_ID, "cohort-2");
      const inCall = capturedCalls["enrollments"].find(([m]) => m === "in");
      expect(inCall?.[2]).toEqual(["cohort-2"]);
    });

    it("cohortId que NO pertenece al programa: cae de vuelta a TODOS los cohortes", async () => {
      state.cohorts = [{ id: "cohort-1", name: "Cohorte A", code: "G1" }];
      state.enrollments = [];
      await getStudentPanelReport(PROGRAM_ID, "cohort-ajena");
      const inCall = capturedCalls["enrollments"].find(([m]) => m === "in");
      expect(inCall?.[2]).toEqual(["cohort-1"]);
    });

    it("programa sin cohortes: no consulta enrollments/class_sessions, students queda vacío", async () => {
      state.cohorts = [];
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result?.students).toEqual([]);
      expect(calledTables).not.toContain("enrollments");
      expect(calledTables).not.toContain("class_sessions");
    });
  });

  describe("asistencia", () => {
    it("sesión cerrada sin registro de asistencia cuenta como inasistencia", async () => {
      state.sessions = [
        {
          id: "s1",
          cohort_id: "cohort-1",
          title: "Clase 1",
          starts_at: "2026-01-15T10:00:00.000Z",
          ends_at: "2026-01-15T12:00:00.000Z",
          status: "closed",
          audience: "all",
        },
      ];
      state.attendance = [];
      const result = await getStudentPanelReport(PROGRAM_ID);
      const row = result!.students[0];
      expect(row.attendance).toMatchObject({ present: 0, total: 1, absences: 1, pct: 0 });
      expect(row.attendance.missed).toEqual([{ id: "s1", title: "Clase 1", startsAt: "2026-01-15T10:00:00.000Z" }]);
    });

    it("sesión cerrada CON registro de asistencia cuenta como presente", async () => {
      state.sessions = [
        {
          id: "s1",
          cohort_id: "cohort-1",
          title: "Clase 1",
          starts_at: "2026-01-15T10:00:00.000Z",
          ends_at: "2026-01-15T12:00:00.000Z",
          status: "closed",
          audience: "all",
        },
      ];
      state.attendance = [{ session_id: "s1", student_id: "stu-1" }];
      const result = await getStudentPanelReport(PROGRAM_ID);
      const row = result!.students[0];
      expect(row.attendance).toMatchObject({ present: 1, total: 1, absences: 0, pct: 100 });
      expect(row.attendance.missed).toEqual([]);
    });

    it("sesión que aún no cierra (dentro de la ventana de gracia): no cuenta en el total", async () => {
      const now = new Date();
      const endsAtHace5Min = new Date(now.getTime() - 5 * 60_000).toISOString();
      state.sessions = [
        {
          id: "s-reciente",
          cohort_id: "cohort-1",
          title: "Clase reciente",
          starts_at: new Date(now.getTime() - 65 * 60_000).toISOString(),
          ends_at: endsAtHace5Min,
          status: "closed",
          audience: "all",
        },
      ];
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students[0].attendance).toMatchObject({ present: 0, total: 0, absences: 0, pct: 0 });
    });

    it("sesión anterior a la matrícula del alumno: no cuenta (sessionAppliesToEnrollment)", async () => {
      state.enrollments[0].enrolled_at = "2026-02-01T00:00:00.000Z";
      state.sessions = [
        {
          id: "s-antes",
          cohort_id: "cohort-1",
          title: "Clase previa",
          starts_at: "2026-01-01T10:00:00.000Z",
          ends_at: "2026-01-01T12:00:00.000Z",
          status: "closed",
          audience: "all",
        },
      ];
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students[0].attendance.total).toBe(0);
    });

    it("sesión exclusiva de un segmento distinto al del alumno: no cuenta", async () => {
      state.enrollments[0].segment = null;
      state.sessions = [
        {
          id: "s-ci",
          cohort_id: "cohort-1",
          title: "Clase CI",
          starts_at: "2026-01-15T10:00:00.000Z",
          ends_at: "2026-01-15T12:00:00.000Z",
          status: "closed",
          audience: "capital_inteligente",
        },
      ];
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students[0].attendance.total).toBe(0);
    });

    it("sesión exclusiva de CI SÍ cuenta cuando el alumno es de ese segmento", async () => {
      state.enrollments[0].segment = "capital_inteligente";
      state.sessions = [
        {
          id: "s-ci",
          cohort_id: "cohort-1",
          title: "Clase CI",
          starts_at: "2026-01-15T10:00:00.000Z",
          ends_at: "2026-01-15T12:00:00.000Z",
          status: "closed",
          audience: "capital_inteligente",
        },
      ];
      state.attendance = [{ session_id: "s-ci", student_id: "stu-1" }];
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students[0].attendance).toMatchObject({ present: 1, total: 1, pct: 100 });
    });

    it("sin sesiones cerradas: no consulta session_attendance", async () => {
      state.sessions = [];
      await getStudentPanelReport(PROGRAM_ID);
      expect(calledTables).not.toContain("session_attendance");
    });

    it("atRisk=false con 1 inasistencia (bajo el umbral)", async () => {
      state.sessions = [
        {
          id: "s1",
          cohort_id: "cohort-1",
          title: "Clase 1",
          starts_at: "2026-01-15T10:00:00.000Z",
          ends_at: "2026-01-15T12:00:00.000Z",
          status: "closed",
          audience: "all",
        },
      ];
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students[0].atRisk).toBe(false);
    });

    it("atRisk=true con 2 inasistencias (umbral exacto)", async () => {
      state.sessions = [
        {
          id: "s1",
          cohort_id: "cohort-1",
          title: "Clase 1",
          starts_at: "2026-01-15T10:00:00.000Z",
          ends_at: "2026-01-15T12:00:00.000Z",
          status: "closed",
          audience: "all",
        },
        {
          id: "s2",
          cohort_id: "cohort-1",
          title: "Clase 2",
          starts_at: "2026-01-16T10:00:00.000Z",
          ends_at: "2026-01-16T12:00:00.000Z",
          status: "closed",
          audience: "all",
        },
      ];
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students[0].atRisk).toBe(true);
      expect(result!.students[0].attendance.absences).toBe(2);
    });
  });

  describe("avance de lecciones", () => {
    it("lección sin mux_playback_id no es completable: no entra en el total ni en pendientes", async () => {
      state.modules = [{ id: "mod-1", title: "Módulo 1", position: 1 }];
      state.lessons = [
        { id: "les-1", module_id: "mod-1", title: "Con video", mux_playback_id: "pb1" },
        { id: "les-2", module_id: "mod-1", title: "Sin video", mux_playback_id: null },
      ];
      state.videoProgress = [];
      const result = await getStudentPanelReport(PROGRAM_ID);
      const progress = result!.students[0].progress;
      expect(progress.total).toBe(1);
      expect(progress.pending).toEqual([{ lessonTitle: "Con video", moduleTitle: "Módulo 1" }]);
    });

    it("lección completada (video_progress.completed=true) cuenta como completado", async () => {
      state.modules = [{ id: "mod-1", title: "Módulo 1", position: 1 }];
      state.lessons = [{ id: "les-1", module_id: "mod-1", title: "Clase 1", mux_playback_id: "pb1" }];
      state.videoProgress = [{ enrollment_id: "enr-1", lesson_id: "les-1", completed: true }];
      const result = await getStudentPanelReport(PROGRAM_ID);
      const progress = result!.students[0].progress;
      expect(progress).toMatchObject({ completed: 1, total: 1, pct: 100, pending: [] });
    });

    it("lección con completed=false en video_progress cuenta como pendiente", async () => {
      state.modules = [{ id: "mod-1", title: "Módulo 1", position: 1 }];
      state.lessons = [{ id: "les-1", module_id: "mod-1", title: "Clase 1", mux_playback_id: "pb1" }];
      state.videoProgress = [{ enrollment_id: "enr-1", lesson_id: "les-1", completed: false }];
      const result = await getStudentPanelReport(PROGRAM_ID);
      const progress = result!.students[0].progress;
      expect(progress).toMatchObject({ completed: 0, total: 1, pct: 0 });
      expect(progress.pending).toEqual([{ lessonTitle: "Clase 1", moduleTitle: "Módulo 1" }]);
    });

    it("lección cuyo module_id no matchea ningún módulo cargado: moduleTitle cae a cadena vacía", async () => {
      // modules debe tener al menos 1 elemento para que se dispare la consulta de
      // lessons (ternario `(modules ?? []).length > 0`); la lección referencia un
      // module_id que NO está en esa lista (dato inconsistente).
      state.modules = [{ id: "mod-otro", title: "Otro módulo", position: 1 }];
      state.lessons = [{ id: "les-1", module_id: "mod-fantasma", title: "Clase 1", mux_playback_id: "pb1" }];
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students[0].progress.pending).toEqual([{ lessonTitle: "Clase 1", moduleTitle: "" }]);
    });

    it("sin módulos: no consulta lessons, total y pct quedan en 0", async () => {
      state.modules = [];
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(calledTables).not.toContain("lessons");
      expect(result!.students[0].progress).toMatchObject({ completed: 0, total: 0, pct: 0 });
    });

    it("sin matrículas: no consulta video_progress ni quiz_attempts", async () => {
      state.enrollments = [];
      await getStudentPanelReport(PROGRAM_ID);
      expect(calledTables).not.toContain("video_progress");
      expect(calledTables).not.toContain("quiz_attempts");
    });
  });

  describe("evaluaciones", () => {
    it("evaluación aprobada (quiz_attempts con passed=true) cuenta en approved", async () => {
      state.evaluations = [{ id: "ev-1", title: "Quiz 1", scope: "module" }];
      state.quizAttempts = [{ evaluation_id: "ev-1", enrollment_id: "enr-1" }];
      const result = await getStudentPanelReport(PROGRAM_ID);
      const evals = result!.students[0].evaluations;
      expect(evals).toMatchObject({ approved: 1, total: 1, pending: [] });
    });

    it("evaluación sin intento aprobado aparece en pending", async () => {
      state.evaluations = [{ id: "ev-1", title: "Quiz 1", scope: "module" }];
      state.quizAttempts = [];
      const result = await getStudentPanelReport(PROGRAM_ID);
      const evals = result!.students[0].evaluations;
      expect(evals).toMatchObject({ approved: 0, total: 1 });
      expect(evals.pending).toEqual([{ title: "Quiz 1", scope: "module" }]);
    });

    it("intento con evaluation_id null se descarta sin romper el conteo", async () => {
      state.evaluations = [{ id: "ev-1", title: "Quiz 1", scope: "module" }];
      state.quizAttempts = [{ evaluation_id: null, enrollment_id: "enr-1" }];
      const result = await getStudentPanelReport(PROGRAM_ID);
      const evals = result!.students[0].evaluations;
      expect(evals.approved).toBe(0);
      expect(evals.pending).toEqual([{ title: "Quiz 1", scope: "module" }]);
    });

    it("sin evaluaciones activas: no consulta quiz_attempts", async () => {
      state.evaluations = [];
      await getStudentPanelReport(PROGRAM_ID);
      expect(calledTables).not.toContain("quiz_attempts");
    });

    it("hay evaluaciones pero ninguna matrícula: no consulta quiz_attempts", async () => {
      state.evaluations = [{ id: "ev-1", title: "Quiz 1", scope: "module" }];
      state.enrollments = [];
      await getStudentPanelReport(PROGRAM_ID);
      expect(calledTables).not.toContain("quiz_attempts");
    });
  });

  describe("presentación del alumno (nombre/iniciales/cohorte)", () => {
    it("full_name presente: se usa tal cual y las iniciales toman la 1ª letra de las 2 primeras palabras", async () => {
      state.enrollments[0].profiles = { full_name: "Juan Pérez", email: "juan@x.cl" };
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students[0]).toMatchObject({ fullName: "Juan Pérez", email: "juan@x.cl", initials: "JP" });
    });

    it("full_name ausente: usa el email como fallback de nombre", async () => {
      state.enrollments[0].profiles = { full_name: null, email: "ana@x.cl" };
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students[0]).toMatchObject({ fullName: "ana@x.cl", email: "ana@x.cl", initials: "A" });
    });

    it("sin perfil (profiles null): usa 'Alumno' y email vacío", async () => {
      state.enrollments[0].profiles = null;
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students[0]).toMatchObject({ fullName: "Alumno", email: "", initials: "A" });
    });

    it("nombre de 3+ palabras: las iniciales solo toman las 2 primeras letras encontradas", async () => {
      state.enrollments[0].profiles = { full_name: "Ana María López", email: null };
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students[0].initials).toBe("AM");
    });

    it("cohortId del enrollment sin match en la lista de cohortes: cohortName cae a cadena vacía", async () => {
      state.enrollments[0].cohort_id = "cohort-fantasma";
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students[0].cohortName).toBe("");
    });

    it("ordena los alumnos alfabéticamente por fullName", async () => {
      state.enrollments = [
        { id: "enr-2", student_id: "stu-2", cohort_id: "cohort-1", segment: null, enrolled_at: "2026-01-01T00:00:00.000Z", profiles: { full_name: "Beltrán Soto", email: null } },
        { id: "enr-1", student_id: "stu-1", cohort_id: "cohort-1", segment: null, enrolled_at: "2026-01-01T00:00:00.000Z", profiles: { full_name: "Ana Ruiz", email: null } },
      ];
      const result = await getStudentPanelReport(PROGRAM_ID);
      expect(result!.students.map((s) => s.fullName)).toEqual(["Ana Ruiz", "Beltrán Soto"]);
    });
  });

  describe("errores de Supabase (no se confunden con 'sin filas')", () => {
    it("class_sessions con error: propaga la excepción en vez de reportar 0% de asistencia", async () => {
      state.errors["class_sessions"] = { code: "57014", message: "canceling statement due to statement timeout" };
      await expect(getStudentPanelReport(PROGRAM_ID)).rejects.toBe(state.errors["class_sessions"]);
    });

    it("video_progress con error: propaga la excepción en vez de reportar 0% de avance", async () => {
      state.modules = [{ id: "mod-1", title: "Módulo 1", position: 1 }];
      state.lessons = [{ id: "les-1", module_id: "mod-1", title: "Clase 1", mux_playback_id: "pb1" }];
      state.errors["video_progress"] = { code: "42501", message: "permission denied for table video_progress" };
      await expect(getStudentPanelReport(PROGRAM_ID)).rejects.toBe(state.errors["video_progress"]);
    });

    it("quiz_attempts con error: propaga la excepción en vez de reportar 0 evaluaciones aprobadas", async () => {
      state.evaluations = [{ id: "ev-1", title: "Quiz 1", scope: "module" }];
      state.errors["quiz_attempts"] = { code: "57014", message: "canceling statement due to statement timeout" };
      await expect(getStudentPanelReport(PROGRAM_ID)).rejects.toBe(state.errors["quiz_attempts"]);
    });

    it("cohorts con error: propaga la excepción en vez de devolver un reporte con students vacío", async () => {
      state.errors["cohorts"] = { code: "57014", message: "canceling statement due to statement timeout" };
      await expect(getStudentPanelReport(PROGRAM_ID)).rejects.toBe(state.errors["cohorts"]);
    });
  });

  it("devuelve program y cohorts tal cual se consultaron", async () => {
    const result = await getStudentPanelReport(PROGRAM_ID);
    expect(result!.program).toEqual({ id: "prog-1", name: "Programa X" });
    expect(result!.cohorts).toEqual([{ id: "cohort-1", name: "Cohorte A", code: "G1" }]);
  });
});
