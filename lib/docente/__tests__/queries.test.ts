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
      then: (resolve: (v: { data: Row[] }) => void) => resolve({ data: rows }),
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
});
