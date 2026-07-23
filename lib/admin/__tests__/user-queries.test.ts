import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Cobertura de `lib/admin/user-queries.ts`: listado de usuarios (sin/scopeado
 * a un programa), perfil de usuario (con actividad reciente), miembros de un
 * cohorte y el picker de cohortes.
 *
 * Se mockea SOLO el borde externo: `createClient` (`@/lib/supabase/server`).
 * Cada tabla se resuelve con un builder encadenable (`select/eq/in/order/limit`)
 * que inspecciona los métodos invocados para decidir qué fixture devolver —
 * necesario porque el módulo consulta la misma tabla ("profiles",
 * "cohort_roles", "cohorts") con distintos filtros según la función.
 *
 * `state.nullOverride[key]` simula que Supabase devuelve `data: null, error:
 * {...}` (p. ej. un error real de RLS o timeout 57014, ver incidente
 * 2026-07-21) — el módulo revisa `error` y propaga la falla en vez de
 * tratarla como "sin datos".
 */

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  system_role: "user" | "ops" | "admin";
  created_at: string;
  onboarding_completed_at: string | null;
  avatar_url: string | null;
  updated_at: string;
};

type CohortRoleRow = {
  id: string;
  user_id: string;
  cohort_id: string;
  role: "student" | "teacher" | "assistant";
  granted_at: string;
  cohorts: {
    name: string;
    code: string;
    program_id: string | null;
    programs: { name: string } | null;
  } | null;
  profiles: { full_name: string | null; email: string } | null;
};

type CohortRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  program_id: string;
  programs: { name: string } | null;
};

type EnrollmentRow = { id: string; student_id: string; cohort_id: string; segment: "capital_inteligente" | null };

type VideoProgressRow = {
  enrollment_id: string;
  lesson_id: string;
  watch_percentage: number;
  completed: boolean;
  last_watched_at: string;
  lessons: { title: string } | null;
};

type State = {
  profiles: ProfileRow[];
  cohortRoles: CohortRoleRow[];
  cohorts: CohortRow[];
  enrollments: EnrollmentRow[];
  videoProgress: VideoProgressRow[];
  nullOverride: Record<string, boolean>;
};

let state: State;
const callHistory: string[] = [];

function defaultState(): State {
  return {
    profiles: [],
    cohortRoles: [],
    cohorts: [],
    enrollments: [],
    videoProgress: [],
    nullOverride: {},
  };
}

/** Devuelve `data: null, error` si la clave está forzada (simula un error real de Supabase); si no, el resultado calculado. */
function resolved(key: string, compute: () => unknown) {
  if (state.nullOverride[key]) {
    return { data: null, error: { message: `error simulado en ${key}` } };
  }
  return { data: compute(), error: null };
}

type Call = [string, ...unknown[]];

function makeBuilder(resolve: (calls: Call[]) => unknown) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args] as Call);
      return builder;
    };
  }
  builder.single = () => Promise.resolve(resolve(calls));
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve(calls)).then(res, rej);
  return builder;
}

function profilesResolve(calls: Call[]) {
  const eqId = calls.find((c) => c[0] === "eq" && c[1] === "id");
  if (eqId) {
    const id = eqId[2] as string;
    return resolved("profiles:detail", () => state.profiles.find((p) => p.id === id) ?? null);
  }
  const inSystemRole = calls.find((c) => c[0] === "in" && c[1] === "system_role");
  if (inSystemRole) {
    const roles = inSystemRole[2] as string[];
    return resolved("profiles:staff", () => state.profiles.filter((p) => roles.includes(p.system_role)));
  }
  const inId = calls.find((c) => c[0] === "in" && c[1] === "id");
  if (inId) {
    const ids = inId[2] as string[];
    return resolved("profiles:members", () => state.profiles.filter((p) => ids.includes(p.id)));
  }
  return resolved("profiles:list", () =>
    [...state.profiles].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
  );
}

function cohortRolesResolve(calls: Call[]) {
  const inUser = calls.find((c) => c[0] === "in" && c[1] === "user_id");
  if (inUser) {
    const ids = inUser[2] as string[];
    return resolved("cohort_roles:byUserIds", () => state.cohortRoles.filter((r) => ids.includes(r.user_id)));
  }
  const inCohort = calls.find((c) => c[0] === "in" && c[1] === "cohort_id");
  if (inCohort) {
    const ids = inCohort[2] as string[];
    return resolved("cohort_roles:byCohortIds", () => state.cohortRoles.filter((r) => ids.includes(r.cohort_id)));
  }
  const eqUser = calls.find((c) => c[0] === "eq" && c[1] === "user_id");
  if (eqUser) {
    const id = eqUser[2] as string;
    return resolved("cohort_roles:byUserId", () => state.cohortRoles.filter((r) => r.user_id === id));
  }
  const eqCohort = calls.find((c) => c[0] === "eq" && c[1] === "cohort_id");
  if (eqCohort) {
    const id = eqCohort[2] as string;
    return resolved("cohort_roles:byCohortId", () => state.cohortRoles.filter((r) => r.cohort_id === id));
  }
  return { data: [] };
}

function cohortsResolve(calls: Call[]) {
  const eqProgram = calls.find((c) => c[0] === "eq" && c[1] === "program_id");
  if (eqProgram) {
    const id = eqProgram[2] as string;
    return resolved("cohorts:byProgram", () =>
      state.cohorts.filter((c) => c.program_id === id).map((c) => ({ id: c.id })),
    );
  }
  const inStatus = calls.find((c) => c[0] === "in" && c[1] === "status");
  if (inStatus) {
    const statuses = inStatus[2] as string[];
    return resolved("cohorts:picker", () => state.cohorts.filter((c) => statuses.includes(c.status)));
  }
  return { data: [] };
}

function enrollmentsResolve(calls: Call[]) {
  const eqStudent = calls.find((c) => c[0] === "eq" && c[1] === "student_id");
  if (eqStudent) {
    const id = eqStudent[2] as string;
    return resolved("enrollments:byStudent", () =>
      state.enrollments.filter((e) => e.student_id === id).map((e) => ({ id: e.id })),
    );
  }
  const eqCohort = calls.find((c) => c[0] === "eq" && c[1] === "cohort_id");
  if (eqCohort) {
    const id = eqCohort[2] as string;
    return resolved("enrollments:byCohort", () =>
      state.enrollments
        .filter((e) => e.cohort_id === id)
        .map((e) => ({ student_id: e.student_id, segment: e.segment })),
    );
  }
  return { data: [] };
}

function videoProgressResolve(calls: Call[]) {
  const inEnr = calls.find((c) => c[0] === "in" && c[1] === "enrollment_id");
  const ids = (inEnr?.[2] as string[]) ?? [];
  return resolved("video_progress:list", () => {
    let rows = state.videoProgress.filter((p) => ids.includes(p.enrollment_id));
    rows = [...rows].sort((a, b) => (a.last_watched_at < b.last_watched_at ? 1 : -1));
    const limitCall = calls.find((c) => c[0] === "limit");
    if (limitCall) rows = rows.slice(0, limitCall[1] as number);
    return rows;
  });
}

const fakeSupabase = {
  from: (table: string) => {
    callHistory.push(table);
    if (table === "profiles") return makeBuilder(profilesResolve);
    if (table === "cohort_roles") return makeBuilder(cohortRolesResolve);
    if (table === "cohorts") return makeBuilder(cohortsResolve);
    if (table === "enrollments") return makeBuilder(enrollmentsResolve);
    if (table === "video_progress") return makeBuilder(videoProgressResolve);
    throw new Error(`tabla no mockeada: ${table}`);
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeSupabase),
}));

const { getAdminUsersList, getAdminUserProfile, getCohortMembers, getCohortsForPicker } = await import(
  "@/lib/admin/user-queries"
);

function makeProfile(overrides: Partial<ProfileRow>): ProfileRow {
  return {
    id: "u1",
    email: "u1@x.cl",
    full_name: "Ana Ruiz",
    phone: null,
    system_role: "user",
    created_at: "2026-01-01T00:00:00.000Z",
    onboarding_completed_at: null,
    avatar_url: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("getAdminUsersList", () => {
  beforeEach(() => {
    state = defaultState();
    callHistory.length = 0;
  });

  describe("sin programId (alcance global)", () => {
    it("sin perfiles: devuelve []", async () => {
      const result = await getAdminUsersList();
      expect(result).toEqual([]);
    });

    it("arma un usuario con sus roles de cohorte y fallbacks cuando cohorts/programs vienen null", async () => {
      state.profiles = [makeProfile({ id: "u1" })];
      state.cohortRoles = [
        {
          id: "cr-1",
          user_id: "u1",
          cohort_id: "c1",
          role: "student",
          granted_at: "2026-01-02T00:00:00.000Z",
          cohorts: { name: "Cohorte A", code: "G1", program_id: "p1", programs: { name: "Diplomado" } },
          profiles: null,
        },
        {
          id: "cr-2",
          user_id: "u1",
          cohort_id: "c2",
          role: "assistant",
          granted_at: "2026-01-03T00:00:00.000Z",
          cohorts: null,
          profiles: null,
        },
      ];
      const result = await getAdminUsersList();
      expect(result).toHaveLength(1);
      expect(result[0].cohort_roles).toEqual([
        {
          id: "cr-1",
          cohort_id: "c1",
          cohort_name: "Cohorte A",
          cohort_code: "G1",
          role: "student",
          program_id: "p1",
          program_name: "Diplomado",
        },
        {
          id: "cr-2",
          cohort_id: "c2",
          cohort_name: "",
          cohort_code: "",
          role: "assistant",
          program_id: "",
          program_name: "",
        },
      ]);
    });

    it("usuario sin roles de cohorte: cohort_roles queda vacío", async () => {
      state.profiles = [makeProfile({ id: "u1" })];
      const result = await getAdminUsersList();
      expect(result[0].cohort_roles).toEqual([]);
    });

    it("si la consulta de perfiles falla (error de Supabase), propaga la excepción en vez de devolver []", async () => {
      state.nullOverride["profiles:list"] = true;
      await expect(getAdminUsersList()).rejects.toThrow();
    });
  });

  describe("con programId (scopeado a un entorno)", () => {
    it("programa sin cohortes: solo devuelve el staff transversal (admin/ops), sin consultar cohort_roles por cohorte", async () => {
      state.profiles = [
        makeProfile({ id: "admin-1", system_role: "admin" }),
        makeProfile({ id: "user-1", system_role: "user" }),
      ];
      const result = await getAdminUsersList("prog-1");
      expect(result.map((u) => u.id)).toEqual(["admin-1"]);
    });

    it("arma miembros del programa + staff transversal, sin duplicar al staff que también es miembro", async () => {
      state.cohorts = [{ id: "c1", name: "Cohorte A", code: "G1", status: "active", program_id: "prog-1", programs: null }];
      state.profiles = [
        makeProfile({ id: "admin-1", system_role: "admin", created_at: "2026-01-01T00:00:00.000Z" }),
        makeProfile({ id: "student-1", system_role: "user", created_at: "2026-01-05T00:00:00.000Z" }),
      ];
      state.cohortRoles = [
        {
          id: "cr-1",
          user_id: "student-1",
          cohort_id: "c1",
          role: "student",
          granted_at: "2026-01-05T00:00:00.000Z",
          cohorts: { name: "Cohorte A", code: "G1", program_id: "prog-1", programs: { name: "Diplomado" } },
          profiles: null,
        },
        // admin-1 también tiene un rol de docente en la propia cohorte del programa: no debe duplicarse.
        {
          id: "cr-2",
          user_id: "admin-1",
          cohort_id: "c1",
          role: "teacher",
          granted_at: "2026-01-01T00:00:00.000Z",
          cohorts: { name: "Cohorte A", code: "G1", program_id: "prog-1", programs: { name: "Diplomado" } },
          profiles: null,
        },
      ];
      const result = await getAdminUsersList("prog-1");
      expect(result).toHaveLength(2);
      // Ordenado descendente por created_at: student-1 (05-ene) antes que admin-1 (01-ene).
      expect(result.map((u) => u.id)).toEqual(["student-1", "admin-1"]);
      const admin = result.find((u) => u.id === "admin-1")!;
      expect(admin.cohort_roles).toHaveLength(1);
      expect(admin.cohort_roles[0].role).toBe("teacher");
    });

    it("si la consulta de cohortes del programa falla (error de Supabase), propaga la excepción en vez de ocultar a los miembros", async () => {
      state.nullOverride["cohorts:byProgram"] = true;
      state.profiles = [makeProfile({ id: "admin-1", system_role: "admin" }), makeProfile({ id: "student-1" })];
      await expect(getAdminUsersList("prog-1")).rejects.toThrow();
    });

    it("si la consulta de roles por cohorte falla (error de Supabase), propaga la excepción en vez de vaciar el listado", async () => {
      state.cohorts = [{ id: "c1", name: "Cohorte A", code: "G1", status: "active", program_id: "prog-1", programs: null }];
      state.nullOverride["cohort_roles:byCohortIds"] = true;
      state.profiles = [makeProfile({ id: "student-1" })];
      await expect(getAdminUsersList("prog-1")).rejects.toThrow();
    });

    it("acota los cohort_roles mostrados a las cohortes del programa (no filtra pertenencias de otros entornos)", async () => {
      state.cohorts = [{ id: "c1", name: "Cohorte A", code: "G1", status: "active", program_id: "prog-1", programs: null }];
      state.profiles = [makeProfile({ id: "student-1" })];
      state.cohortRoles = [
        {
          id: "cr-1",
          user_id: "student-1",
          cohort_id: "c1",
          role: "student",
          granted_at: "2026-01-01T00:00:00.000Z",
          cohorts: { name: "Cohorte A", code: "G1", program_id: "prog-1", programs: { name: "Diplomado" } },
          profiles: null,
        },
        // Rol en una cohorte de OTRO programa: la resolución ya lo excluye porque
        // el módulo solo pide cohort_roles de los cohortIds del programa consultado.
        {
          id: "cr-2",
          user_id: "student-1",
          cohort_id: "c-otro-programa",
          role: "student",
          granted_at: "2026-01-01T00:00:00.000Z",
          cohorts: { name: "Otra Cohorte", code: "G9", program_id: "prog-2", programs: { name: "Liderazgo" } },
          profiles: null,
        },
      ];
      const result = await getAdminUsersList("prog-1");
      expect(result[0].cohort_roles.map((r) => r.cohort_id)).toEqual(["c1"]);
    });
  });
});

describe("getAdminUserProfile", () => {
  beforeEach(() => {
    state = defaultState();
    callHistory.length = 0;
  });

  it("usuario inexistente: devuelve null", async () => {
    const result = await getAdminUserProfile("no-existe");
    expect(result).toBeNull();
  });

  it("usuario existente sin roles ni matrículas: cohort_roles y recent_activity vacíos", async () => {
    state.profiles = [makeProfile({ id: "u1" })];
    const result = await getAdminUserProfile("u1");
    expect(result).not.toBeNull();
    expect(result!.cohort_roles).toEqual([]);
    expect(result!.recent_activity).toEqual([]);
  });

  it("usuario con roles: arma cohort_roles con fallback '' cuando cohorts/programs vienen null", async () => {
    state.profiles = [makeProfile({ id: "u1" })];
    state.cohortRoles = [
      {
        id: "cr-1",
        user_id: "u1",
        cohort_id: "c1",
        role: "teacher",
        granted_at: "2026-01-01T00:00:00.000Z",
        cohorts: { name: "Cohorte A", code: "G1", program_id: "p1", programs: null },
        profiles: null,
      },
    ];
    const result = await getAdminUserProfile("u1");
    expect(result!.cohort_roles).toEqual([
      { id: "cr-1", cohort_id: "c1", cohort_name: "Cohorte A", cohort_code: "G1", role: "teacher", program_id: "p1", program_name: "" },
    ]);
  });

  it("usuario con matrícula pero sin actividad de video: recent_activity vacío", async () => {
    state.profiles = [makeProfile({ id: "u1" })];
    state.enrollments = [{ id: "enr-1", student_id: "u1", cohort_id: "c1", segment: null }];
    const result = await getAdminUserProfile("u1");
    expect(result!.recent_activity).toEqual([]);
  });

  it("usuario con actividad: mapea watch_percentage a número, ordena por last_watched_at desc, límite 10 y fallback de título vacío", async () => {
    state.profiles = [makeProfile({ id: "u1" })];
    state.enrollments = [{ id: "enr-1", student_id: "u1", cohort_id: "c1", segment: null }];
    state.videoProgress = [
      { enrollment_id: "enr-1", lesson_id: "les-1", watch_percentage: 50, completed: false, last_watched_at: "2026-01-01T00:00:00.000Z", lessons: { title: "Clase 1" } },
      { enrollment_id: "enr-1", lesson_id: "les-2", watch_percentage: 100, completed: true, last_watched_at: "2026-01-02T00:00:00.000Z", lessons: null },
    ];
    const result = await getAdminUserProfile("u1");
    expect(result!.recent_activity).toEqual([
      { lesson_id: "les-2", lesson_title: "", watch_percentage: 100, completed: true, last_watched_at: "2026-01-02T00:00:00.000Z" },
      { lesson_id: "les-1", lesson_title: "Clase 1", watch_percentage: 50, completed: false, last_watched_at: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("si la consulta de roles falla (error de Supabase), propaga la excepción en vez de vaciar cohort_roles", async () => {
    state.profiles = [makeProfile({ id: "u1" })];
    state.nullOverride["cohort_roles:byUserId"] = true;
    await expect(getAdminUserProfile("u1")).rejects.toThrow();
  });

  it("si la consulta de matrículas falla (error de Supabase), propaga la excepción y no llega a consultar video_progress", async () => {
    state.profiles = [makeProfile({ id: "u1" })];
    state.nullOverride["enrollments:byStudent"] = true;
    await expect(getAdminUserProfile("u1")).rejects.toThrow();
    expect(callHistory).not.toContain("video_progress");
  });

  it("si la consulta de video_progress falla (error de Supabase), propaga la excepción en vez de vaciar recent_activity", async () => {
    state.profiles = [makeProfile({ id: "u1" })];
    state.enrollments = [{ id: "enr-1", student_id: "u1", cohort_id: "c1", segment: null }];
    state.nullOverride["video_progress:list"] = true;
    await expect(getAdminUserProfile("u1")).rejects.toThrow();
  });
});

describe("getCohortMembers", () => {
  beforeEach(() => {
    state = defaultState();
    callHistory.length = 0;
  });

  it("si la consulta de roles falla (error de Supabase), propaga la excepción en vez de listas vacías indistinguibles de 'sin miembros'", async () => {
    state.nullOverride["cohort_roles:byCohortId"] = true;
    await expect(getCohortMembers("c1")).rejects.toThrow();
  });

  it("separa teachers/assistants/students por rol y arma el segmento desde enrollments", async () => {
    state.cohortRoles = [
      { id: "cr-1", user_id: "t1", cohort_id: "c1", role: "teacher", granted_at: "2026-01-01T00:00:00.000Z", cohorts: null, profiles: { full_name: "Profe Uno", email: "profe@x.cl" } },
      { id: "cr-2", user_id: "a1", cohort_id: "c1", role: "assistant", granted_at: "2026-01-01T00:00:00.000Z", cohorts: null, profiles: { full_name: "Ayudante Uno", email: "ayudante@x.cl" } },
      { id: "cr-3", user_id: "s1", cohort_id: "c1", role: "student", granted_at: "2026-01-01T00:00:00.000Z", cohorts: null, profiles: { full_name: "Alumno Uno", email: "alumno@x.cl" } },
    ];
    state.enrollments = [{ id: "enr-1", student_id: "s1", cohort_id: "c1", segment: "capital_inteligente" }];
    const result = await getCohortMembers("c1");
    expect(result.teachers).toEqual([{ user_id: "t1", full_name: "Profe Uno", email: "profe@x.cl", role: "teacher", granted_at: "2026-01-01T00:00:00.000Z", segment: null }]);
    expect(result.assistants).toEqual([{ user_id: "a1", full_name: "Ayudante Uno", email: "ayudante@x.cl", role: "assistant", granted_at: "2026-01-01T00:00:00.000Z", segment: null }]);
    expect(result.students).toEqual([{ user_id: "s1", full_name: "Alumno Uno", email: "alumno@x.cl", role: "student", granted_at: "2026-01-01T00:00:00.000Z", segment: "capital_inteligente" }]);
  });

  it("alumno sin matrícula (o sin segmento) en la tabla enrollments: segment cae a null", async () => {
    state.cohortRoles = [
      { id: "cr-1", user_id: "s1", cohort_id: "c1", role: "student", granted_at: "2026-01-01T00:00:00.000Z", cohorts: null, profiles: { full_name: "Alumno Uno", email: "alumno@x.cl" } },
    ];
    state.enrollments = [];
    const result = await getCohortMembers("c1");
    expect(result.students[0].segment).toBeNull();
  });

  it("perfil ausente en el join (profiles null): full_name null y email cae a cadena vacía", async () => {
    state.cohortRoles = [
      { id: "cr-1", user_id: "s1", cohort_id: "c1", role: "student", granted_at: "2026-01-01T00:00:00.000Z", cohorts: null, profiles: null },
    ];
    const result = await getCohortMembers("c1");
    expect(result.students[0]).toMatchObject({ full_name: null, email: "" });
  });
});

describe("getCohortsForPicker", () => {
  beforeEach(() => {
    state = defaultState();
    callHistory.length = 0;
  });

  it("BUG: si la consulta falla (data null), devuelve [] indistinguible de 'no hay cohortes planned/active'", async () => {
    state.nullOverride["cohorts:picker"] = true;
    const result = await getCohortsForPicker();
    expect(result).toEqual([]);
  });

  it("filtra solo cohortes planned/active y descarta otros estados", async () => {
    state.cohorts = [
      { id: "c1", name: "Cohorte A", code: "G1", status: "active", program_id: "p1", programs: { name: "Diplomado" } },
      { id: "c2", name: "Cohorte B", code: "G2", status: "planned", program_id: "p1", programs: { name: "Diplomado" } },
      { id: "c3", name: "Cohorte C", code: "G3", status: "archived", program_id: "p1", programs: { name: "Diplomado" } },
    ];
    const result = await getCohortsForPicker();
    expect(result.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("mapea program_name con fallback '' cuando programs viene null", async () => {
    state.cohorts = [{ id: "c1", name: "Cohorte A", code: "G1", status: "active", program_id: "p1", programs: null }];
    const result = await getCohortsForPicker();
    expect(result[0]).toEqual({ id: "c1", name: "Cohorte A", code: "G1", status: "active", program_name: "" });
  });
});
