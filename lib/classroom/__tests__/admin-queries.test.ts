import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Fake genérico de un query builder de Supabase (postgrest-js). Soporta la
// cadena de métodos que usa lib/classroom/admin-queries.ts (select/eq/in/order)
// y el terminal `single`, además de ser "thenable" para las consultas que se
// awaitean directo sin terminal explícito. Se configura por tabla con
// { data, error }.
// ---------------------------------------------------------------------------
type Resp = { data?: unknown; error?: unknown };
type Call = { table: string; method: string; args: unknown[] };

function makeBuilder(resp: Resp, calls: Call[], table: string) {
  const builder: Record<string, unknown> = {};
  const chainMethods = ["select", "eq", "in", "order"];
  for (const m of chainMethods) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ table, method: m, args });
      return builder;
    };
  }
  const resolveValue = () =>
    Promise.resolve({ data: resp.data ?? null, error: resp.error ?? null });
  builder.single = resolveValue;
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) =>
    resolveValue().then(onFulfilled, onRejected);
  builder.catch = (onRejected: (e: unknown) => unknown) => resolveValue().catch(onRejected);
  return builder;
}

function makeFakeSupabase(responses: Record<string, Resp>, calls: Call[] = []) {
  return {
    from: (table: string) => {
      const resp: Resp = responses[table] ?? {};
      return makeBuilder(resp, calls, table);
    },
  };
}

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const { getCohortProgressReport } = await import("@/lib/classroom/admin-queries");

beforeEach(() => {
  mockCreateClient.mockReset();
});

// ---------------------------------------------------------------------------

const BASE_COHORT = { id: "c1", slug: "g4", programs: { id: "p1", name: "Diplomado G4" } };

describe("getCohortProgressReport — cohorte inexistente", () => {
  it("devuelve null cuando la cohorte no existe", async () => {
    mockCreateClient.mockResolvedValue(makeFakeSupabase({ cohorts: { data: null } }));

    const result = await getCohortProgressReport("no-existe");

    expect(result).toBeNull();
  });
});

describe("getCohortProgressReport — matrículas ausentes", () => {
  it("devuelve estado degradado (students: []) cuando la consulta de matrículas falla", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        cohorts: { data: BASE_COHORT },
        enrollments: { data: null },
      }),
    );

    const result = await getCohortProgressReport("c1");

    expect(result).toEqual({
      cohort: BASE_COHORT,
      program: BASE_COHORT.programs,
      students: [],
    });
    // No debe traer `modules` porque el flujo corta antes de consultarlos.
    expect(result).not.toHaveProperty("modules");
  });
});

describe("getCohortProgressReport — módulos ausentes", () => {
  it("devuelve estado degradado (students: []) cuando la consulta de módulos falla", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        cohorts: { data: BASE_COHORT },
        enrollments: {
          data: [{ id: "e1", student_id: "u1", profiles: { full_name: "Ana Soto", email: "ana@x.cl" } }],
        },
        program_modules: { data: null },
      }),
    );

    const result = await getCohortProgressReport("c1");

    expect(result).toEqual({
      cohort: BASE_COHORT,
      program: BASE_COHORT.programs,
      students: [],
    });
  });
});

describe("getCohortProgressReport — sin matrículas activas (lista vacía)", () => {
  it("no consulta video_progress y devuelve students: [] cuando enrollments es []", async () => {
    const calls: Call[] = [];
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase(
        {
          cohorts: { data: BASE_COHORT },
          enrollments: { data: [] },
          program_modules: { data: [{ id: "m1", title: "Módulo 1", position: 1 }] },
          lessons: { data: [] },
        },
        calls,
      ),
    );

    const result = await getCohortProgressReport("c1");

    expect(result?.students).toEqual([]);
    expect(result?.modules).toEqual([{ id: "m1", title: "Módulo 1", position: 1 }]);
    // enrollmentIds.length === 0 -> rama que evita la consulta a video_progress.
    expect(calls.some((c) => c.table === "video_progress")).toBe(false);
  });
});

describe("getCohortProgressReport — video_progress falla", () => {
  it("usa allProgress = [] cuando la consulta de progreso devuelve data: null", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        cohorts: { data: BASE_COHORT },
        enrollments: {
          data: [{ id: "e1", student_id: "u1", profiles: { full_name: "Ana Soto", email: "ana@x.cl" } }],
        },
        program_modules: { data: [{ id: "m1", title: "Módulo 1", position: 1 }] },
        lessons: { data: [{ id: "l1", module_id: "m1", mux_playback_id: "mux-1" }] },
        video_progress: { data: null },
      }),
    );

    const result = await getCohortProgressReport("c1");

    expect(result?.students).toHaveLength(1);
    expect(result?.students[0].overall_percentage).toBe(0);
    expect(result?.students[0].last_seen).toBeNull();
  });
});

describe("getCohortProgressReport — sin módulos (lista vacía)", () => {
  it("overall_percentage es 0 cuando el programa no tiene módulos", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        cohorts: { data: BASE_COHORT },
        enrollments: {
          data: [{ id: "e1", student_id: "u1", profiles: { full_name: "Ana Soto", email: "ana@x.cl" } }],
        },
        program_modules: { data: [] },
        lessons: { data: [] },
        video_progress: { data: [] },
      }),
    );

    const result = await getCohortProgressReport("c1");

    expect(result?.students[0].module_progress).toEqual([]);
    expect(result?.students[0].overall_percentage).toBe(0);
  });
});

describe("getCohortProgressReport — nombre del alumno", () => {
  const modules = [{ id: "m1", title: "Módulo 1", position: 1 }];
  const lessons = [{ id: "l1", module_id: "m1", mux_playback_id: "mux-1" }];

  it("usa 'Alumno' cuando no hay perfil asociado", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        cohorts: { data: BASE_COHORT },
        enrollments: { data: [{ id: "e1", student_id: "u1", profiles: null }] },
        program_modules: { data: modules },
        lessons: { data: lessons },
        video_progress: { data: [] },
      }),
    );

    const result = await getCohortProgressReport("c1");

    expect(result?.students[0].full_name).toBe("Alumno");
    expect(result?.students[0].email).toBe("");
  });

  it("usa el email como nombre cuando full_name es null", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        cohorts: { data: BASE_COHORT },
        enrollments: {
          data: [{ id: "e1", student_id: "u1", profiles: { full_name: null, email: "sin-nombre@x.cl" } }],
        },
        program_modules: { data: modules },
        lessons: { data: lessons },
        video_progress: { data: [] },
      }),
    );

    const result = await getCohortProgressReport("c1");

    expect(result?.students[0].full_name).toBe("sin-nombre@x.cl");
  });

  it("calcula las iniciales a partir del nombre completo", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        cohorts: { data: BASE_COHORT },
        enrollments: {
          data: [{ id: "e1", student_id: "u1", profiles: { full_name: "Ana Soto", email: "ana@x.cl" } }],
        },
        program_modules: { data: modules },
        lessons: { data: lessons },
        video_progress: { data: [] },
      }),
    );

    const result = await getCohortProgressReport("c1");

    expect(result?.students[0].initials).toBe("AS");
  });
});

describe("getCohortProgressReport — lecciones sin mux_playback_id", () => {
  it("excluye del conteo las lecciones sin video subido (total_lessons no las cuenta)", async () => {
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase({
        cohorts: { data: BASE_COHORT },
        enrollments: {
          data: [{ id: "e1", student_id: "u1", profiles: { full_name: "Ana Soto", email: "ana@x.cl" } }],
        },
        program_modules: { data: [{ id: "m1", title: "Módulo 1", position: 1 }] },
        lessons: {
          data: [
            { id: "l1", module_id: "m1", mux_playback_id: "mux-1" },
            { id: "l2", module_id: "m1", mux_playback_id: null },
          ],
        },
        video_progress: { data: [] },
      }),
    );

    const result = await getCohortProgressReport("c1");

    expect(result?.students[0].module_progress[0].total_lessons).toBe(1);
  });
});

describe("getCohortProgressReport — camino feliz completo", () => {
  it("calcula progreso por módulo, porcentaje global, último visto y ordena por overall_percentage desc", async () => {
    const cohort = { id: "c1", slug: "g4", programs: { id: "p1", name: "Diplomado G4" } };
    const modules = [
      { id: "m1", title: "Módulo 1", position: 1 },
      { id: "m2", title: "Módulo 2", position: 2 },
    ];
    const lessons = [
      { id: "l1", module_id: "m1", mux_playback_id: "mux-1" },
      { id: "l2", module_id: "m1", mux_playback_id: "mux-2" },
      { id: "l3", module_id: "m2", mux_playback_id: "mux-3" },
    ];
    const enrollments = [
      { id: "e1", student_id: "u1", profiles: { full_name: "Ana Soto", email: "ana@x.cl" } },
      { id: "e2", student_id: "u2", profiles: { full_name: "Beto Ruiz", email: "beto@x.cl" } },
    ];
    // Ana: l1 completo 100%, l2 50% -> módulo1 avg 75, redondeado 75; completed_lessons=1.
    //      módulo2 sin progreso -> avg 0.
    //      overall = round((75+0)/2) = 38 (redondeo bancario de JS: 37.5 -> 38)
    // Beto: sin registros de progreso -> todo 0.
    const progress = [
      {
        enrollment_id: "e1",
        lesson_id: "l1",
        watch_percentage: "100",
        completed: true,
        last_watched_at: "2026-07-01T10:00:00.000Z",
      },
      {
        enrollment_id: "e1",
        lesson_id: "l2",
        watch_percentage: "50",
        completed: false,
        last_watched_at: "2026-07-10T10:00:00.000Z",
      },
    ];

    const calls: Call[] = [];
    mockCreateClient.mockResolvedValue(
      makeFakeSupabase(
        {
          cohorts: { data: cohort },
          enrollments: { data: enrollments },
          program_modules: { data: modules },
          lessons: { data: lessons },
          video_progress: { data: progress },
        },
        calls,
      ),
    );

    const result = await getCohortProgressReport("c1");

    expect(result?.cohort).toEqual(cohort);
    expect(result?.program).toEqual(cohort.programs);
    expect(result?.modules).toEqual(modules);

    const [first, second] = result!.students;

    // Ana tiene overall_percentage mayor -> queda primera tras el sort desc.
    expect(first.student_id).toBe("u1");
    expect(first.module_progress[0]).toEqual({
      module_id: "m1",
      module_title: "Módulo 1",
      module_position: 1,
      total_lessons: 2,
      completed_lessons: 1,
      percentage: 75,
    });
    expect(first.module_progress[1]).toEqual({
      module_id: "m2",
      module_title: "Módulo 2",
      module_position: 2,
      total_lessons: 1,
      completed_lessons: 0,
      percentage: 0,
    });
    expect(first.overall_percentage).toBe(38);
    // last_seen toma el más reciente entre los registros del alumno.
    expect(first.last_seen).toBe("2026-07-10T10:00:00.000Z");

    expect(second.student_id).toBe("u2");
    expect(second.overall_percentage).toBe(0);
    expect(second.last_seen).toBeNull();

    // Verifica que video_progress se filtró por los enrollment_id correctos.
    const progressCall = calls.find((c) => c.table === "video_progress" && c.method === "in");
    expect(progressCall?.args).toEqual(["enrollment_id", ["e1", "e2"]]);
  });
});
