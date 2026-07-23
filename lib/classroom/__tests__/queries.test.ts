import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Fake genérico de un query builder de Supabase (postgrest-js). Soporta la
// cadena de métodos que usa lib/classroom/queries.ts (select/eq/neq/in/order)
// y los dos terminales (single/maybeSingle), además de ser "thenable" para
// las consultas que se awaitean directo sin terminal explícito. Se configura
// por tabla con { data, error } o { reject } para simular un throw del
// cliente (try/catch de degradación).
// ---------------------------------------------------------------------------
type Resp = { data?: unknown; error?: unknown; reject?: unknown };
type Call = { table: string; method: string; args: unknown[] };

function makeBuilder(resp: Resp, calls: Call[], table: string) {
  const builder: Record<string, unknown> = {};
  const chainMethods = ["select", "eq", "neq", "in", "order"];
  for (const m of chainMethods) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ table, method: m, args });
      return builder;
    };
  }
  const resolveValue = () =>
    resp.reject
      ? Promise.reject(resp.reject)
      : Promise.resolve({ data: resp.data ?? null, error: resp.error ?? null });
  builder.single = resolveValue;
  builder.maybeSingle = resolveValue;
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
    resolveValue().then(onFulfilled, onRejected);
  builder.catch = (onRejected: (e: unknown) => unknown) => resolveValue().catch(onRejected);
  return builder;
}

function makeFakeSupabase(responses: Record<string, Resp | Resp[]>, calls: Call[] = []) {
  const counters: Record<string, number> = {};
  return {
    from: (table: string) => {
      const idx = counters[table] ?? 0;
      counters[table] = idx + 1;
      const cfg = responses[table];
      const resp: Resp = Array.isArray(cfg) ? (cfg[idx] ?? cfg[cfg.length - 1] ?? {}) : (cfg ?? {});
      return makeBuilder(resp, calls, table);
    },
  };
}

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

// createAdminClient es SÍNCRONO en el módulo real (no se awaitea en queries.ts).
const mockCreateAdminClient = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

const {
  getCohortSlugById,
  getEnrollmentForUser,
  getActiveEnrollmentsForUser,
  getTeachingCohortsForUser,
  getCohortWithProgram,
  getModulesWithLessons,
  getModuleSessionsForCohort,
  getCohortSchedule,
  getLessonById,
  getSessionForStudent,
  getSessionRecordingRedirect,
  getLessonProgress,
} = await import("@/lib/classroom/queries");

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockCreateClient.mockReset();
  mockCreateAdminClient.mockReset();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// ---------------------------------------------------------------------------

describe("getCohortSlugById", () => {
  it("devuelve el slug cuando la cohorte existe", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({ cohorts: { data: { slug: "diplomado-g4" } } }),
    );
    expect(await getCohortSlugById("c1")).toBe("diplomado-g4");
  });

  it("devuelve null cuando no hay datos", async () => {
    mockCreateClient.mockResolvedValue(makeFakeSupabase({ cohorts: { data: null } }));
    expect(await getCohortSlugById("no-existe")).toBeNull();
  });
});

describe("getEnrollmentForUser — acceso permanente (RN-049/050, RN-T03)", () => {
  it("concede acceso al contenido para matrículas 'active' Y 'completed', no solo activas", async () => {
    const calls: Call[] = [];
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase(
        {
          enrollments: {
            data: { id: "e1", status: "completed", cohort_id: "c1", student_id: "u1" },
          },
        },
        calls,
      ),
    );

    const result = await getEnrollmentForUser("u1", "c1");
    expect(result).toEqual({
      id: "e1",
      status: "completed",
      cohort_id: "c1",
      student_id: "u1",
    });
    // El estado académico 'completed' no debe expulsar al alumno del aula.
    expect(calls).toContainEqual({
      table: "enrollments",
      method: "in",
      args: ["status", ["active", "completed"]],
    });
  });

  it("devuelve null cuando no hay matrícula que cumpla el filtro", async () => {
    mockCreateClient.mockResolvedValue(makeFakeSupabase({ enrollments: { data: null } }));
    expect(await getEnrollmentForUser("u1", "c1")).toBeNull();
  });
});

describe("getActiveEnrollmentsForUser", () => {
  it("mapea cohorte + programa embebidos a la forma plana esperada", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        enrollments: {
          data: [
            {
              enrolled_at: "2026-01-01T00:00:00Z",
              cohorts: {
                id: "c1",
                slug: "diplomado-g4",
                name: "G4",
                programs: { id: "p1", name: "Diplomado", code: "DIP", description: "desc" },
              },
            },
          ],
        },
      }),
    );

    const result = await getActiveEnrollmentsForUser("u1");
    expect(result).toEqual([
      {
        cohortId: "c1",
        cohortSlug: "diplomado-g4",
        cohortName: "G4",
        programId: "p1",
        programName: "Diplomado",
        programCode: "DIP",
        programDescription: "desc",
      },
    ]);
  });

  it("sin matrículas activas devuelve arreglo vacío", async () => {
    mockCreateClient.mockResolvedValue(makeFakeSupabase({ enrollments: { data: [] } }));
    expect(await getActiveEnrollmentsForUser("u1")).toEqual([]);
  });
});

describe("getTeachingCohortsForUser", () => {
  it("mapea cohort_roles (teacher/assistant) a la misma forma que las matrículas", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        cohort_roles: {
          data: [
            {
              granted_at: "2026-02-01T00:00:00Z",
              cohorts: {
                id: "c2",
                slug: "liderazgo-g1",
                name: "Liderazgo G1",
                programs: { id: "p2", name: "Liderazgo", code: null, description: null },
              },
            },
          ],
        },
      }),
    );

    const result = await getTeachingCohortsForUser("u-teacher");
    expect(result).toEqual([
      {
        cohortId: "c2",
        cohortSlug: "liderazgo-g1",
        cohortName: "Liderazgo G1",
        programId: "p2",
        programName: "Liderazgo",
        programCode: null,
        programDescription: null,
      },
    ]);
  });

  it("sin roles docentes devuelve arreglo vacío", async () => {
    mockCreateClient.mockResolvedValue(makeFakeSupabase({ cohort_roles: { data: [] } }));
    expect(await getTeachingCohortsForUser("u1")).toEqual([]);
  });
});

describe("getCohortWithProgram — manejo de errores", () => {
  it("devuelve la cohorte con su programa embebido en el camino feliz", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({ cohorts: { data: { id: "c1", programs: { id: "p1" } } } }),
    );
    expect(await getCohortWithProgram("c1")).toEqual({ id: "c1", programs: { id: "p1" } });
  });

  it("devuelve null sin lanzar cuando la cohorte no existe (PGRST116, 0 filas)", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        cohorts: { data: null, error: { code: "PGRST116", message: "0 rows" } },
      }),
    );
    expect(await getCohortWithProgram("c-no-existe")).toBeNull();
  });

  it("lanza cuando el error es transitorio (57014, statement timeout)", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        cohorts: {
          data: null,
          error: { code: "57014", message: "canceling statement due to statement timeout" },
        },
      }),
    );
    await expect(getCohortWithProgram("c1")).rejects.toBeTruthy();
  });
});

describe("getModulesWithLessons", () => {
  it("sin módulos (data null) devuelve arreglo vacío sin más consultas", async () => {
    const calls: Call[] = [];
    mockCreateClient.mockResolvedValue(makeFakeSupabase({ program_modules: { data: null } }, calls));

    const result = await getModulesWithLessons("p1", null);
    expect(result).toEqual([]);
    expect(calls.some((c) => c.table === "lesson_resources")).toBe(false);
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("módulo sin lecciones: no consulta progreso/recursos ni el reverse-lookup de grabaciones", async () => {
    const calls: Call[] = [];
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase(
        { program_modules: { data: [{ id: "m1", position: 1, teacher: null, lessons: [] }] } },
        calls,
      ),
    );

    const result = await getModulesWithLessons("p1", "e1");
    expect(result).toEqual([{ id: "m1", position: 1, teacher: null, lessons: [] }]);
    expect(calls.some((c) => c.table === "lesson_resources")).toBe(false);
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("con matrícula: adjunta progreso/recursos, excluye la repetición de clase en vivo y ordena por posición", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        program_modules: {
          data: [
            {
              id: "m1",
              position: 1,
              teacher: { full_name: "Ana" },
              lessons: [
                { id: "l2", position: 2 },
                { id: "l1", position: 1 },
                { id: "l3", position: 3 }, // repetición de clase en vivo, se filtra
              ],
            },
            // Módulo sin la clave `lessons` (join vacío): cubre el `?? []`.
            { id: "m2", position: 2, teacher: null },
          ],
        },
        video_progress: { data: [{ lesson_id: "l1", enrollment_id: "e1" }] },
        lesson_resources: { data: [{ id: "r1", lesson_id: "l2", position: 1 }] },
      }),
    );
    mockCreateAdminClient.mockReturnValue(
      makeFakeSupabase({ class_sessions: { data: [{ lesson_id: "l3" }] } }),
    );

    const result = await getModulesWithLessons("p1", "e1");

    expect(result).toHaveLength(2);
    const m1 = result[0] as unknown as {
      teacher: unknown;
      lessons: Array<{ id: string; video_progress: unknown; resources: unknown[] }>;
    };
    // l3 excluida (repetición), l1 y l2 quedan ordenadas por posición ascendente.
    expect(m1.lessons.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(m1.lessons[0].video_progress).toEqual({ lesson_id: "l1", enrollment_id: "e1" });
    expect(m1.lessons[0].resources).toEqual([]);
    expect(m1.lessons[1].video_progress).toBeNull();
    expect(m1.lessons[1].resources).toEqual([{ id: "r1", lesson_id: "l2", position: 1 }]);
    expect(m1.teacher).toEqual({ full_name: "Ana" });

    const m2 = result[1] as unknown as { lessons: unknown[] };
    expect(m2.lessons).toEqual([]);
  });

  it("sin matrícula (enrollmentId null): omite la consulta de video_progress, progreso queda vacío", async () => {
    const calls: Call[] = [];
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase(
        {
          program_modules: {
            data: [{ id: "m1", position: 1, teacher: null, lessons: [{ id: "l1", position: 1 }] }],
          },
          lesson_resources: { data: [] },
        },
        calls,
      ),
    );
    mockCreateAdminClient.mockReturnValue(makeFakeSupabase({ class_sessions: { data: [] } }));

    const result = await getModulesWithLessons("p1", null);
    const m1 = result[0] as unknown as { lessons: Array<{ video_progress: unknown }> };
    expect(m1.lessons[0].video_progress).toBeNull();
    expect(calls.some((c) => c.table === "video_progress")).toBe(false);
  });
});

describe("getModuleSessionsForCohort", () => {
  it("sin sesiones devuelve arreglo vacío sin consultar instructores/recursos/evaluaciones", async () => {
    const calls: Call[] = [];
    mockCreateClient.mockResolvedValue(makeFakeSupabase({ class_sessions: { data: [] } }, calls));

    const result = await getModuleSessionsForCohort("c1", "mod1");
    expect(result).toEqual([]);
    expect(calls.every((c) => c.table === "class_sessions")).toBe(true);
  });

  it("camino feliz: adjunta docente, recursos y quiz activo de la sesión", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        class_sessions: {
          data: [
            {
              id: "s1",
              cohort_id: "c1",
              module_id: "mod1",
              teacher_id: "t1",
              lesson_id: null,
              status: "scheduled",
              starts_at: "2026-08-01T00:00:00Z",
              title: "Clase 1",
              audience: "all",
            },
          ],
        },
        instructors: { data: [{ id: "t1", full_name: "Prof X", photo_url: null }] },
        session_resources: {
          data: [
            { id: "r1", session_id: "s1", title: "Guía", type: "pdf", url: "https://x", storage_path: null, position: 1 },
          ],
        },
        evaluations: {
          data: [
            { id: "ev1", title: "Quiz 1", session_id: "s1", is_active: true, opens_at: null, closes_at: null },
          ],
        },
      }),
    );

    const [session] = await getModuleSessionsForCohort("c1", "mod1");
    expect(session.teacher).toEqual({ id: "t1", full_name: "Prof X", photo_url: null });
    expect(session.resources).toEqual([
      { id: "r1", session_id: "s1", title: "Guía", type: "pdf", url: "https://x", storage_path: null, position: 1 },
    ]);
    expect(session.evaluation).toEqual({ id: "ev1", title: "Quiz 1" });
  });

  it("sesión sin docente: no consulta instructores y teacher queda null", async () => {
    const calls: Call[] = [];
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase(
        {
          class_sessions: {
            data: [
              {
                id: "s1",
                cohort_id: "c1",
                module_id: "mod1",
                teacher_id: null,
                status: "scheduled",
                starts_at: "2026-08-01T00:00:00Z",
                title: "Clase 1",
                audience: "all",
              },
            ],
          },
          session_resources: { data: [] },
          evaluations: { data: [] },
        },
        calls,
      ),
    );

    const [session] = await getModuleSessionsForCohort("c1", "mod1");
    expect(session.teacher).toBeNull();
    expect(calls.some((c) => c.table === "instructors")).toBe(false);
  });

  it("evaluación fuera de ventana (opens_at futuro) no se ofrece como quiz activo", async () => {
    const futureIso = new Date(Date.now() + 86_400_000).toISOString();
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        class_sessions: {
          data: [
            {
              id: "s1",
              cohort_id: "c1",
              module_id: "mod1",
              teacher_id: null,
              status: "scheduled",
              starts_at: "2026-08-01T00:00:00Z",
              title: "Clase 1",
              audience: "all",
            },
          ],
        },
        session_resources: { data: [] },
        evaluations: {
          data: [
            { id: "ev1", title: "Quiz 1", session_id: "s1", is_active: true, opens_at: futureIso, closes_at: null },
          ],
        },
      }),
    );

    const [session] = await getModuleSessionsForCohort("c1", "mod1");
    expect(session.evaluation).toBeNull();
  });
});

describe("getCohortSchedule", () => {
  it("sin sesiones y sin error: devuelve arreglo vacío sin loguear", async () => {
    mockCreateClient.mockResolvedValue(makeFakeSupabase({ class_sessions: { data: [] } }));
    const result = await getCohortSchedule("c1");
    expect(result).toEqual([]);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("error del query CORE: loguea y propaga el error (no degrada a arreglo vacío)", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({ class_sessions: { data: null, error: { message: "boom" } } }),
    );
    await expect(getCohortSchedule("c1")).rejects.toEqual({ message: "boom" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[getCohortSchedule] class_sessions query error",
      { message: "boom" },
    );
  });

  it("camino feliz: docente, recursos y evaluación resueltos", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        class_sessions: {
          data: [
            {
              id: "s1",
              cohort_id: "c1",
              teacher_id: "t1",
              lesson_id: null,
              status: "scheduled",
              starts_at: "2026-08-01T00:00:00Z",
              title: "Clase 1",
              audience: "all",
            },
          ],
        },
        instructors: { data: [{ id: "t1", full_name: "Prof X", photo_url: null }] },
        session_resources: {
          data: [
            { id: "r1", session_id: "s1", title: "Guía", type: "pdf", url: "https://x", storage_path: null, position: 1 },
          ],
        },
        evaluations: { data: [] },
      }),
    );

    const [session] = await getCohortSchedule("c1");
    expect(session.teacher).toEqual({ id: "t1", full_name: "Prof X", photo_url: null });
    expect(session.resources).toHaveLength(1);
    expect(session.evaluation).toBeNull();
  });

  it("teacherIds vacío: no consulta instructores", async () => {
    const calls: Call[] = [];
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase(
        {
          class_sessions: {
            data: [
              {
                id: "s1",
                cohort_id: "c1",
                teacher_id: null,
                status: "scheduled",
                starts_at: "2026-08-01T00:00:00Z",
                title: "Clase 1",
                audience: "all",
              },
            ],
          },
          session_resources: { data: [] },
          evaluations: { data: [] },
        },
        calls,
      ),
    );

    await getCohortSchedule("c1");
    expect(calls.some((c) => c.table === "instructors")).toBe(false);
  });

  it("degrada si la consulta de instructores lanza (no tumba la vista)", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        class_sessions: {
          data: [
            {
              id: "s1",
              cohort_id: "c1",
              teacher_id: "t1",
              status: "scheduled",
              starts_at: "2026-08-01T00:00:00Z",
              title: "Clase 1",
              audience: "all",
            },
          ],
        },
        instructors: { reject: new Error("network down") },
        session_resources: { data: [] },
        evaluations: { data: [] },
      }),
    );

    const [session] = await getCohortSchedule("c1");
    expect(session.teacher).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[getCohortSchedule] instructors degradando",
      expect.any(Error),
    );
  });

  it("degrada si la consulta de session_resources lanza (no tumba la vista)", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        class_sessions: {
          data: [
            {
              id: "s1",
              cohort_id: "c1",
              teacher_id: null,
              status: "scheduled",
              starts_at: "2026-08-01T00:00:00Z",
              title: "Clase 1",
              audience: "all",
            },
          ],
        },
        session_resources: { reject: new Error("storage down") },
        evaluations: { data: [] },
      }),
    );

    const [session] = await getCohortSchedule("c1");
    expect(session.resources).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[getCohortSchedule] session_resources degradando",
      expect.any(Error),
    );
  });
});

describe("getLessonById", () => {
  it("devuelve la lección con su módulo y programa embebidos", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({ lessons: { data: { id: "l1", program_modules: { id: "m1" } } } }),
    );
    expect(await getLessonById("l1")).toEqual({ id: "l1", program_modules: { id: "m1" } });
  });

  it("devuelve null cuando la lección no existe", async () => {
    mockCreateClient.mockResolvedValue(makeFakeSupabase({ lessons: { data: null } }));
    expect(await getLessonById("no-existe")).toBeNull();
  });
});

describe("getSessionForStudent", () => {
  it("sesión inexistente devuelve null sin consultar lo demás", async () => {
    const calls: Call[] = [];
    mockCreateClient.mockResolvedValue(makeFakeSupabase({ class_sessions: { data: null } }, calls));

    const result = await getSessionForStudent("s1");
    expect(result).toBeNull();
    expect(calls.every((c) => c.table === "class_sessions")).toBe(true);
  });

  it("camino feliz: docente, recursos, grabación (repetición) y quiz activo", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        class_sessions: {
          data: {
            id: "s1",
            cohort_id: "c1",
            teacher_id: "t1",
            lesson_id: "lesson1",
            status: "scheduled",
            starts_at: "2026-08-01T00:00:00Z",
            title: "Clase X",
            audience: "all",
          },
        },
        instructors: { data: { id: "t1", full_name: "Prof", photo_url: null } },
        session_resources: {
          data: [
            { id: "r1", session_id: "s1", title: "Mat", type: "link", url: "https://y", storage_path: null, position: 1 },
          ],
        },
        evaluations: {
          data: [
            { id: "ev1", title: "Quiz", session_id: "s1", is_active: true, opens_at: null, closes_at: null },
          ],
        },
        lessons: {
          data: {
            id: "lesson1",
            title: "Grabación",
            slug: "grabacion",
            mux_playback_id: "abc",
            video_duration_seconds: 600,
          },
        },
      }),
    );

    const result = await getSessionForStudent("s1");
    expect(result?.teacher).toEqual({ id: "t1", full_name: "Prof", photo_url: null });
    expect(result?.resources).toHaveLength(1);
    expect(result?.recording).toEqual({
      id: "lesson1",
      title: "Grabación",
      slug: "grabacion",
      mux_playback_id: "abc",
      video_duration_seconds: 600,
    });
    expect(result?.evaluation).toEqual({ id: "ev1", title: "Quiz" });
  });

  it("sin docente ni grabación: no consulta instructores ni lessons", async () => {
    const calls: Call[] = [];
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase(
        {
          class_sessions: {
            data: {
              id: "s1",
              cohort_id: "c1",
              teacher_id: null,
              lesson_id: null,
              status: "scheduled",
              starts_at: "2026-08-01T00:00:00Z",
              title: "Clase X",
              audience: "all",
            },
          },
          session_resources: { data: [] },
          evaluations: { data: [] },
        },
        calls,
      ),
    );

    const result = await getSessionForStudent("s1");
    expect(result?.teacher).toBeNull();
    expect(result?.recording).toBeNull();
    expect(calls.some((c) => c.table === "instructors")).toBe(false);
    expect(calls.some((c) => c.table === "lessons")).toBe(false);
  });

  it("degrada el quiz a null si la consulta de evaluaciones lanza", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        class_sessions: {
          data: {
            id: "s1",
            cohort_id: "c1",
            teacher_id: null,
            lesson_id: null,
            status: "scheduled",
            starts_at: "2026-08-01T00:00:00Z",
            title: "Clase X",
            audience: "all",
          },
        },
        session_resources: { data: [] },
        evaluations: { reject: new Error("db down") },
      }),
    );

    const result = await getSessionForStudent("s1");
    expect(result?.evaluation).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[getActiveSessionEvaluations] degradando (quiz CTA oculto)",
      expect.any(Error),
    );
  });
});

describe("getSessionRecordingRedirect", () => {
  it("sin sesión enlazada devuelve null", async () => {
    mockCreateClient.mockResolvedValue(makeFakeSupabase({ class_sessions: { data: null } }));
    expect(await getSessionRecordingRedirect("l1")).toBeNull();
  });

  it("usa el slug de la cohorte cuando está disponible", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        class_sessions: { data: { id: "s1", cohort_id: "c1", cohorts: { slug: "diplomado-g4" } } },
      }),
    );
    expect(await getSessionRecordingRedirect("l1")).toEqual({
      sessionId: "s1",
      cohortSlug: "diplomado-g4",
    });
  });

  it("sin objeto cohorts (join vacío): usa el cohort_id como fallback", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({ class_sessions: { data: { id: "s1", cohort_id: "c1", cohorts: null } } }),
    );
    expect(await getSessionRecordingRedirect("l1")).toEqual({
      sessionId: "s1",
      cohortSlug: "c1",
    });
  });

  it("cohorts presente pero slug null: también usa el cohort_id como fallback", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        class_sessions: { data: { id: "s1", cohort_id: "c1", cohorts: { slug: null } } },
      }),
    );
    expect(await getSessionRecordingRedirect("l1")).toEqual({
      sessionId: "s1",
      cohortSlug: "c1",
    });
  });
});

describe("getLessonProgress", () => {
  it("sin enrollmentId devuelve null sin llamar al cliente", async () => {
    const result = await getLessonProgress(null, "l1");
    expect(result).toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("con enrollmentId y progreso existente lo devuelve", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({ video_progress: { data: { lesson_id: "l1", enrollment_id: "e1" } } }),
    );
    expect(await getLessonProgress("e1", "l1")).toEqual({ lesson_id: "l1", enrollment_id: "e1" });
  });

  it("con enrollmentId pero sin fila de progreso devuelve null", async () => {
    mockCreateClient.mockResolvedValue(makeFakeSupabase({ video_progress: { data: null } }));
    expect(await getLessonProgress("e1", "l1")).toBeNull();
  });
});
