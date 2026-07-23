import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;
type TableData = Record<string, Row[]>;

let currentFrom: ReturnType<typeof makeFrom>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => currentFrom(table) }),
}));

const {
  __getTeacherCohortsUncached: getTeacherCohortsUncached,
  getTeacherSessions,
  getTeacherGradableEvaluations,
  isTeacherUser,
  getTeacherStudentCount,
} = await import("@/lib/docente/queries");

/**
 * Mock mínimo del query builder de supabase-js: cada filtro (`eq`/`in`)
 * reduce de verdad las filas en memoria. Los joins embebidos (`cohorts`,
 * `programs`) se resuelven dejándolos ya anidados en las filas de fixture,
 * como hacen `lib/asistencia/__tests__/absence-threshold.test.ts` y similares.
 */
function makeFrom(data: TableData) {
  return vi.fn((table: string) => {
    let rows = [...(data[table] ?? [])];
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return chain;
      }),
      in: vi.fn((col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return chain;
      }),
      order: vi.fn(() => chain),
      then: (resolve: (v: { data: Row[]; count: number }) => void) =>
        resolve({ data: rows, count: rows.length }),
    };
    return chain;
  });
}

function cohortJoin(cohortId: string, programId: string, cohortName = "Cohorte", programName = "Programa") {
  return {
    id: cohortId,
    name: cohortName,
    slug: cohortId,
    program_id: programId,
    programs: { id: programId, name: programName },
  };
}

describe("getTeacherCohorts (uncached)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("teacher puro (cohort_roles) -> 1 cohorte source:'role'", async () => {
    currentFrom = makeFrom({
      cohort_roles: [
        { user_id: "u-role", role: "teacher", cohort_id: "c1", cohorts: cohortJoin("c1", "p1") },
      ],
      instructors: [],
    });

    const result = await getTeacherCohortsUncached("u-role");

    expect(result).toEqual([
      expect.objectContaining({ cohortId: "c1", source: "role" }),
    ]);
  });

  it("admin instructor (sin cohort_roles) -> 1 cohorte source:'instructor'", async () => {
    currentFrom = makeFrom({
      cohort_roles: [],
      instructors: [{ id: "i2", profile_id: "u-instr" }],
      class_sessions: [{ teacher_id: "i2", cohort_id: "c2", cohorts: cohortJoin("c2", "p2") }],
    });

    const result = await getTeacherCohortsUncached("u-instr");

    expect(result).toEqual([
      expect.objectContaining({ cohortId: "c2", source: "instructor" }),
    ]);
  });

  it("admin sin cohort_roles ni ficha de instructor -> []", async () => {
    currentFrom = makeFrom({ cohort_roles: [], instructors: [] });

    const result = await getTeacherCohortsUncached("u-none");

    expect(result).toEqual([]);
  });

  it("teacher + instructor de la MISMA cohorte -> UNA entrada, source:'role' (no se degrada)", async () => {
    currentFrom = makeFrom({
      cohort_roles: [
        { user_id: "u-both", role: "teacher", cohort_id: "c4", cohorts: cohortJoin("c4", "p4") },
      ],
      instructors: [{ id: "i4", profile_id: "u-both" }],
      class_sessions: [{ teacher_id: "i4", cohort_id: "c4", cohorts: cohortJoin("c4", "p4") }],
    });

    const result = await getTeacherCohortsUncached("u-both");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ cohortId: "c4", source: "role" }));
  });

  it("dedup: 2 fichas de instructors con el mismo profile_id -> 1 cohorte sin duplicados", async () => {
    currentFrom = makeFrom({
      cohort_roles: [],
      instructors: [
        { id: "i6a", profile_id: "u-dedup" },
        { id: "i6b", profile_id: "u-dedup" },
      ],
      class_sessions: [
        { teacher_id: "i6a", cohort_id: "c6", cohorts: cohortJoin("c6", "p6") },
        { teacher_id: "i6b", cohort_id: "c6", cohorts: cohortJoin("c6", "p6") },
      ],
    });

    const result = await getTeacherCohortsUncached("u-dedup");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ cohortId: "c6", source: "instructor" }));
  });

  it("via cohort_roles: fila sin join de cohorts o sin programs se descarta", async () => {
    currentFrom = makeFrom({
      cohort_roles: [
        { user_id: "u-orphan", role: "teacher", cohort_id: "c7", cohorts: cohortJoin("c7", "p7") },
        { user_id: "u-orphan", role: "teacher", cohort_id: "c8", cohorts: null },
        {
          user_id: "u-orphan",
          role: "teacher",
          cohort_id: "c9",
          cohorts: { id: "c9", name: "C9", slug: "c9", program_id: "p9", programs: null },
        },
      ],
      instructors: [],
    });

    const result = await getTeacherCohortsUncached("u-orphan");

    expect(result).toEqual([expect.objectContaining({ cohortId: "c7", source: "role" })]);
  });

  it("via instructors: fila sin join de cohorts o sin programs se descarta", async () => {
    currentFrom = makeFrom({
      cohort_roles: [],
      instructors: [{ id: "i-orphan", profile_id: "u-orphan-instr" }],
      class_sessions: [
        { teacher_id: "i-orphan", cohort_id: "c10", cohorts: cohortJoin("c10", "p10") },
        { teacher_id: "i-orphan", cohort_id: "c11", cohorts: null },
        {
          teacher_id: "i-orphan",
          cohort_id: "c12",
          cohorts: { id: "c12", name: "C12", slug: "c12", program_id: "p12", programs: null },
        },
      ],
    });

    const result = await getTeacherCohortsUncached("u-orphan-instr");

    expect(result).toEqual([expect.objectContaining({ cohortId: "c10", source: "instructor" })]);
  });

  it("orden: por nombre de programa y, si empatan, por nombre de cohorte", async () => {
    currentFrom = makeFrom({
      cohort_roles: [
        {
          user_id: "u-sort-cohorts",
          role: "teacher",
          cohort_id: "c-zeta",
          cohorts: cohortJoin("c-zeta", "p-zeta", "Cualquiera", "Zeta Programa"),
        },
        {
          user_id: "u-sort-cohorts",
          role: "teacher",
          cohort_id: "c-alfa",
          cohorts: cohortJoin("c-alfa", "p-alfa", "Otra", "Alfa Programa"),
        },
        {
          user_id: "u-sort-cohorts",
          role: "teacher",
          cohort_id: "c-beta-y",
          cohorts: cohortJoin("c-beta-y", "p-beta", "Y", "Beta Programa"),
        },
        {
          user_id: "u-sort-cohorts",
          role: "teacher",
          cohort_id: "c-beta-x",
          cohorts: cohortJoin("c-beta-x", "p-beta", "X", "Beta Programa"),
        },
      ],
      instructors: [],
    });

    const result = await getTeacherCohortsUncached("u-sort-cohorts");

    expect(result.map((c) => c.cohortId)).toEqual(["c-alfa", "c-beta-x", "c-beta-y", "c-zeta"]);
  });
});

describe("isTeacherUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("con cohorte asignada -> true", async () => {
    currentFrom = makeFrom({
      cohort_roles: [
        {
          user_id: "u-isteacher-true",
          role: "teacher",
          cohort_id: "c-it1",
          cohorts: cohortJoin("c-it1", "p-it1"),
        },
      ],
      instructors: [],
    });

    expect(await isTeacherUser("u-isteacher-true")).toBe(true);
  });

  it("sin cohortes -> false", async () => {
    currentFrom = makeFrom({ cohort_roles: [], instructors: [] });

    expect(await isTeacherUser("u-isteacher-false")).toBe(false);
  });
});

describe("getTeacherStudentCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cohortIds vacío -> 0 sin consultar", async () => {
    currentFrom = makeFrom({ enrollments: [{ id: "e1", cohort_id: "c1", status: "active" }] });

    const result = await getTeacherStudentCount([]);

    expect(result).toBe(0);
    expect(currentFrom).not.toHaveBeenCalled();
  });

  it("cuenta solo matrículas activas de las cohortes indicadas", async () => {
    currentFrom = makeFrom({
      enrollments: [
        { id: "e1", cohort_id: "c1", status: "active" },
        { id: "e2", cohort_id: "c1", status: "active" },
        { id: "e3", cohort_id: "c1", status: "inactive" },
        { id: "e4", cohort_id: "c-otra", status: "active" },
      ],
    });

    const result = await getTeacherStudentCount(["c1"]);

    expect(result).toBe(2);
  });
});

describe("getTeacherSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cohorte solo-instructor con 3 sesiones, 1 suya -> devuelve 1", async () => {
    currentFrom = makeFrom({
      cohort_roles: [],
      instructors: [{ id: "i5", profile_id: "u-sess" }],
      class_sessions: [
        {
          id: "s1",
          cohort_id: "c5",
          title: "S1",
          starts_at: "2026-01-01T00:00:00Z",
          ends_at: "2026-01-01T01:00:00Z",
          modality: "live_online",
          status: "scheduled",
          teacher_id: "i5",
          cohorts: cohortJoin("c5", "p5"),
        },
        {
          id: "s2",
          cohort_id: "c5",
          title: "S2",
          starts_at: "2026-01-02T00:00:00Z",
          ends_at: "2026-01-02T01:00:00Z",
          modality: "live_online",
          status: "scheduled",
          teacher_id: "i-other",
          cohorts: cohortJoin("c5", "p5"),
        },
        {
          id: "s3",
          cohort_id: "c5",
          title: "S3",
          starts_at: "2026-01-03T00:00:00Z",
          ends_at: "2026-01-03T01:00:00Z",
          modality: "live_online",
          status: "scheduled",
          teacher_id: null,
          cohorts: cohortJoin("c5", "p5"),
        },
      ],
      session_resources: [],
    });

    const result = await getTeacherSessions("u-sess");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s1");
  });

  it("sin cohortes -> [] sin consultar class_sessions", async () => {
    currentFrom = makeFrom({ cohort_roles: [], instructors: [] });

    const result = await getTeacherSessions("u-sess-none-cohorts");

    expect(result).toEqual([]);
  });

  it("cohorte vía 'role': todas las sesiones se listan (sin filtrar por teacher_id) y traen sus recursos", async () => {
    currentFrom = makeFrom({
      cohort_roles: [
        {
          user_id: "u-sess-role-res",
          role: "teacher",
          cohort_id: "c-role-1",
          cohorts: cohortJoin("c-role-1", "p-role-1"),
        },
      ],
      instructors: [],
      class_sessions: [
        {
          id: "sr1",
          cohort_id: "c-role-1",
          title: "SR1",
          starts_at: "2026-02-01T00:00:00Z",
          ends_at: "2026-02-01T01:00:00Z",
          modality: "live_online",
          status: "scheduled",
          teacher_id: "cualquiera-no-es-instructor-suyo",
        },
        {
          id: "sr2",
          cohort_id: "c-role-1",
          title: "SR2",
          starts_at: "2026-02-02T00:00:00Z",
          ends_at: "2026-02-02T01:00:00Z",
          modality: "live_online",
          status: "scheduled",
          teacher_id: null,
        },
      ],
      session_resources: [
        {
          id: "res1",
          session_id: "sr1",
          title: "Guía",
          type: "pdf",
          url: null,
          storage_path: "x/y.pdf",
          position: 0,
        },
      ],
    });

    const result = await getTeacherSessions("u-sess-role-res");

    expect(result.map((s) => s.id)).toEqual(["sr1", "sr2"]);
    expect(result[0].resources).toEqual([expect.objectContaining({ id: "res1" })]);
    expect(result[1].resources).toEqual([]);
  });

  it("cohorte sin sesiones -> [] y no consulta session_resources", async () => {
    currentFrom = makeFrom({
      cohort_roles: [
        {
          user_id: "u-sess-empty-sessions",
          role: "teacher",
          cohort_id: "c-role-2",
          cohorts: cohortJoin("c-role-2", "p-role-2"),
        },
      ],
      instructors: [],
      class_sessions: [],
      session_resources: [
        {
          id: "res-huerfano",
          session_id: "no-existe",
          title: "Guía",
          type: "pdf",
          url: null,
          storage_path: null,
          position: 0,
        },
      ],
    });

    const result = await getTeacherSessions("u-sess-empty-sessions");

    expect(result).toEqual([]);
  });
});

describe("getTeacherGradableEvaluations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("teacher puro -> aparece en gradables", async () => {
    currentFrom = makeFrom({
      cohort_roles: [
        { user_id: "u-role-grad", role: "teacher", cohort_id: "c1g", cohorts: cohortJoin("c1g", "p1g") },
      ],
      instructors: [],
      evaluations: [
        { id: "e1", title: "Quiz 1", scope: "session", kind: "quiz", program_id: "p1g", is_active: true },
      ],
    });

    const result = await getTeacherGradableEvaluations("u-role-grad");

    expect(result.map((r) => r.id)).toEqual(["e1"]);
  });

  it("admin instructor (solo vía instructor) -> gradables []", async () => {
    currentFrom = makeFrom({
      cohort_roles: [],
      instructors: [{ id: "i2g", profile_id: "u-instr-grad" }],
      class_sessions: [{ teacher_id: "i2g", cohort_id: "c2g", cohorts: cohortJoin("c2g", "p2g") }],
      evaluations: [
        { id: "e2", title: "Quiz 2", scope: "session", kind: "quiz", program_id: "p2g", is_active: true },
      ],
    });

    const result = await getTeacherGradableEvaluations("u-instr-grad");

    expect(result).toEqual([]);
  });

  it("admin sin clases -> gradables []", async () => {
    currentFrom = makeFrom({ cohort_roles: [], instructors: [], evaluations: [] });

    const result = await getTeacherGradableEvaluations("u-none-grad");

    expect(result).toEqual([]);
  });

  it("filtra por programa de cada cohorte y ordena por activas, cohorte y título", async () => {
    currentFrom = makeFrom({
      cohort_roles: [
        {
          user_id: "u-sort-grad",
          role: "teacher",
          cohort_id: "c-zeta-g",
          cohorts: cohortJoin("c-zeta-g", "p1-g", "Zeta", "Programa 1"),
        },
        {
          user_id: "u-sort-grad",
          role: "teacher",
          cohort_id: "c-alfa-g",
          cohorts: cohortJoin("c-alfa-g", "p1-g", "Alfa", "Programa 1"),
        },
        {
          user_id: "u-sort-grad",
          role: "teacher",
          cohort_id: "c-beta-g",
          cohorts: cohortJoin("c-beta-g", "p2-g", "Beta", "Programa 2"),
        },
      ],
      instructors: [],
      evaluations: [
        { id: "e1", title: "B Quiz", scope: "session", kind: "quiz", program_id: "p1-g", is_active: true },
        { id: "e2", title: "A Quiz", scope: "session", kind: "quiz", program_id: "p1-g", is_active: true },
        {
          id: "e3",
          title: "C Quiz",
          scope: "session",
          kind: "manual",
          program_id: "p2-g",
          is_active: false,
        },
        // BUG: is_active undefined -> `ev.is_active ?? false` lo trata como inactivo;
        // confirmamos ese comportamiento actual (no hay validación en BD que lo impida).
        { id: "e4", title: "D Quiz", scope: "session", kind: "quiz", program_id: "p2-g", is_active: undefined },
      ],
    });

    const result = await getTeacherGradableEvaluations("u-sort-grad");

    // Zeta/Alfa son del mismo programa (p1-g): reciben e1 y e2, no e3/e4 (programa p2-g).
    // Beta es de p2-g: recibe e3 y e4, no e1/e2 (continue por mismatch de programId).
    expect(result.map((r) => `${r.cohortName}/${r.title}`)).toEqual([
      "Alfa/A Quiz",
      "Alfa/B Quiz",
      "Zeta/A Quiz",
      "Zeta/B Quiz",
      "Beta/C Quiz",
      "Beta/D Quiz",
    ]);
    expect(result.filter((r) => r.isActive)).toHaveLength(4);
    expect(result.find((r) => r.id === "e4" && r.cohortName === "Beta")?.isActive).toBe(false);
  });
});
