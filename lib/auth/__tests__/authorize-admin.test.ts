import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockSelectProfile = vi.fn();
const mockCohortRole = vi.fn();

const mockAdminClassSession = vi.fn();
const mockAdminEvaluation = vi.fn();
const mockAdminCohort = vi.fn();

/**
 * Query builder chainable genérico: select/eq/in/limit devuelven el mismo
 * objeto (encadenable en cualquier orden) y single/maybeSingle/await
 * resuelven todos contra el mismo `resolver` (un vi.fn configurable por test).
 * Esto imita el comportamiento thenable de los builders de PostgREST sin
 * tener que replicar la forma exacta de cada cadena del módulo bajo prueba.
 */
function chainable(resolver: () => unknown) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = vi.fn(self);
  builder.eq = vi.fn(self);
  builder.in = vi.fn(self);
  builder.limit = vi.fn(self);
  builder.single = vi.fn(async () => resolver());
  builder.maybeSingle = vi.fn(async () => resolver());
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(resolver()).then(resolve, reject);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: (table: string) => {
      if (table === "profiles") return chainable(mockSelectProfile);
      if (table === "cohort_roles") return chainable(mockCohortRole);
      throw new Error(`from("${table}") no mockeado en este test`);
    },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "class_sessions") return chainable(mockAdminClassSession);
      if (table === "evaluations") return chainable(mockAdminEvaluation);
      if (table === "cohorts") return chainable(mockAdminCohort);
      throw new Error(`from("${table}") no mockeado en este test (admin)`);
    },
  })),
}));

const {
  authorizeAdmin,
  requireStaff,
  requireSessionStaff,
  requireEvaluationStaff,
} = await import("@/lib/auth/authorize-admin");

// Las 4 funciones comparten el mismo AuthResult (discriminado por presencia
// de "error" o "user", sin marcadores ?: never). Estos helpers narrowean
// antes de acceder, ya que el tipo no expone ambas claves en la misma rama.
type AuthResult = Awaited<ReturnType<typeof authorizeAdmin>>;

function errorOf(result: AuthResult) {
  if (!("error" in result)) throw new Error("se esperaba un resultado con error");
  return result.error;
}

function userOf(result: AuthResult) {
  if (!("user" in result)) throw new Error("se esperaba un resultado con user");
  return result.user;
}

function setupMocks(user: { id: string } | null, systemRole: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user },
  });
  mockSelectProfile.mockResolvedValue({
    data: systemRole ? { system_role: systemRole } : null,
  });
}

describe("authorizeAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no user session exists", async () => {
    setupMocks(null, null);
    const result = await authorizeAdmin();
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(401);
  });

  it("returns 403 when user has role 'user'", async () => {
    setupMocks({ id: "user-1" }, "user");
    const result = await authorizeAdmin();
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(403);
  });

  it("returns 403 when user has role 'teacher'", async () => {
    setupMocks({ id: "user-1" }, "teacher");
    const result = await authorizeAdmin();
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(403);
  });

  it("returns user when role is 'admin'", async () => {
    setupMocks({ id: "user-1" }, "admin");
    const result = await authorizeAdmin();
    expect(result).toHaveProperty("user");
    expect(userOf(result).id).toBe("user-1");
  });

  it("returns user when role is 'ops'", async () => {
    setupMocks({ id: "user-1" }, "ops");
    const result = await authorizeAdmin();
    expect(result).toHaveProperty("user");
    expect(userOf(result).id).toBe("user-1");
  });
});

describe("requireStaff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no user session exists", async () => {
    setupMocks(null, null);
    const result = await requireStaff();
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(401);
  });

  it("returns 403 when user has role 'user'", async () => {
    setupMocks({ id: "user-1" }, "user");
    const result = await requireStaff();
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(403);
  });

  it("returns 403 when user has role 'teacher'", async () => {
    setupMocks({ id: "user-1" }, "teacher");
    const result = await requireStaff();
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(403);
  });

  it("allows role 'ops'", async () => {
    setupMocks({ id: "user-1" }, "ops");
    const result = await requireStaff();
    expect(result).toHaveProperty("user");
  });

  it("allows role 'admin'", async () => {
    setupMocks({ id: "user-1" }, "admin");
    const result = await requireStaff();
    expect(result).toHaveProperty("user");
  });
});

describe("requireSessionStaff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Valores por defecto neutros; cada test sobreescribe lo que le importa.
    mockAdminClassSession.mockResolvedValue({ data: null });
    mockCohortRole.mockResolvedValue({ data: null });
  });

  it("returns 401 when no user session exists", async () => {
    setupMocks(null, null);
    const result = await requireSessionStaff("session-1");
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(401);
  });

  it("returns user directly for platform staff (ops/admin) without consultar la sesión", async () => {
    setupMocks({ id: "user-1" }, "ops");
    const result = await requireSessionStaff("session-1");
    expect(result).toHaveProperty("user");
    expect(userOf(result).id).toBe("user-1");
    // No debió necesitar resolver la cohorte de la sesión: el gate corta antes.
    expect(mockAdminClassSession).not.toHaveBeenCalled();
  });

  it("returns 403 when the session does not exist (no ops/admin, sin cohort_role posible)", async () => {
    setupMocks({ id: "user-1" }, "user");
    mockAdminClassSession.mockResolvedValue({ data: null });
    const result = await requireSessionStaff("session-inexistente");
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(403);
  });

  it("returns user when the caller is teacher/assistant of the session's cohort", async () => {
    setupMocks({ id: "user-1" }, "user");
    mockAdminClassSession.mockResolvedValue({ data: { cohort_id: "cohort-1" } });
    mockCohortRole.mockResolvedValue({ data: { id: "role-1" } });
    const result = await requireSessionStaff("session-1");
    expect(result).toHaveProperty("user");
    expect(userOf(result).id).toBe("user-1");
  });

  it("returns 403 when the session exists but the caller has no teacher/assistant role in its cohort", async () => {
    setupMocks({ id: "user-1" }, "user");
    mockAdminClassSession.mockResolvedValue({ data: { cohort_id: "cohort-1" } });
    mockCohortRole.mockResolvedValue({ data: null });
    const result = await requireSessionStaff("session-1");
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(403);
  });
});

describe("requireEvaluationStaff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminEvaluation.mockResolvedValue({ data: null });
    mockAdminCohort.mockResolvedValue({ data: null });
    mockCohortRole.mockResolvedValue({ data: null });
  });

  it("returns 401 when no user session exists", async () => {
    setupMocks(null, null);
    const result = await requireEvaluationStaff("eval-1");
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(401);
  });

  it("returns user directly for platform staff (ops/admin) without consultar la evaluación", async () => {
    setupMocks({ id: "user-1" }, "admin");
    const result = await requireEvaluationStaff("eval-1");
    expect(result).toHaveProperty("user");
    expect(mockAdminEvaluation).not.toHaveBeenCalled();
  });

  it("returns 404 when the evaluation does not exist", async () => {
    setupMocks({ id: "user-1" }, "user");
    mockAdminEvaluation.mockResolvedValue({ data: null });
    const result = await requireEvaluationStaff("eval-inexistente");
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(404);
  });

  it("returns 422 when a cohortId is given but that cohort does not exist", async () => {
    setupMocks({ id: "user-1" }, "user");
    mockAdminEvaluation.mockResolvedValue({
      data: { id: "eval-1", program_id: "prog-1" },
    });
    mockAdminCohort.mockResolvedValue({ data: null });
    const result = await requireEvaluationStaff("eval-1", "cohort-x");
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(422);
  });

  it("returns 422 when the cohort belongs to a different program than the evaluation (tenant check)", async () => {
    setupMocks({ id: "user-1" }, "user");
    mockAdminEvaluation.mockResolvedValue({
      data: { id: "eval-1", program_id: "prog-1" },
    });
    mockAdminCohort.mockResolvedValue({
      data: { id: "cohort-1", program_id: "prog-OTRO" },
    });
    const result = await requireEvaluationStaff("eval-1", "cohort-1");
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(422);
  });

  it("returns user when caller is teacher/assistant of a matching cohort (cohortId branch)", async () => {
    setupMocks({ id: "user-1" }, "user");
    mockAdminEvaluation.mockResolvedValue({
      data: { id: "eval-1", program_id: "prog-1" },
    });
    mockAdminCohort.mockResolvedValue({
      data: { id: "cohort-1", program_id: "prog-1" },
    });
    mockCohortRole.mockResolvedValue({ data: { id: "role-1" } });
    const result = await requireEvaluationStaff("eval-1", "cohort-1");
    expect(result).toHaveProperty("user");
    expect(userOf(result).id).toBe("user-1");
  });

  it("returns 403 when the cohort matches the program but caller has no role in it (cohortId branch)", async () => {
    setupMocks({ id: "user-1" }, "user");
    mockAdminEvaluation.mockResolvedValue({
      data: { id: "eval-1", program_id: "prog-1" },
    });
    mockAdminCohort.mockResolvedValue({
      data: { id: "cohort-1", program_id: "prog-1" },
    });
    mockCohortRole.mockResolvedValue({ data: null });
    const result = await requireEvaluationStaff("eval-1", "cohort-1");
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(403);
  });

  it("returns 403 when there is no cohortId and the program has no cohorts at all", async () => {
    setupMocks({ id: "user-1" }, "user");
    mockAdminEvaluation.mockResolvedValue({
      data: { id: "eval-1", program_id: "prog-1" },
    });
    // Sin cohortId, se consulta cohorts.select("id").eq("program_id", ...):
    // acá se resuelve por await directo del builder (sin maybeSingle).
    mockAdminCohort.mockResolvedValue({ data: [] });
    const result = await requireEvaluationStaff("eval-1");
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(403);
    // Con 0 cohortes en el programa, el código ni siquiera consulta cohort_roles.
    expect(mockCohortRole).not.toHaveBeenCalled();
  });

  it("returns user when there is no cohortId and caller has a role in ANY cohort of the program", async () => {
    setupMocks({ id: "user-1" }, "user");
    mockAdminEvaluation.mockResolvedValue({
      data: { id: "eval-1", program_id: "prog-1" },
    });
    mockAdminCohort.mockResolvedValue({
      data: [{ id: "cohort-1" }, { id: "cohort-2" }],
    });
    mockCohortRole.mockResolvedValue({ data: { id: "role-1" } });
    const result = await requireEvaluationStaff("eval-1");
    expect(result).toHaveProperty("user");
    expect(userOf(result).id).toBe("user-1");
  });

  it("returns 403 when there is no cohortId, the program has cohorts, but caller has a role in none of them", async () => {
    setupMocks({ id: "user-1" }, "user");
    mockAdminEvaluation.mockResolvedValue({
      data: { id: "eval-1", program_id: "prog-1" },
    });
    mockAdminCohort.mockResolvedValue({
      data: [{ id: "cohort-1" }, { id: "cohort-2" }],
    });
    mockCohortRole.mockResolvedValue({ data: null });
    const result = await requireEvaluationStaff("eval-1");
    expect(result).toHaveProperty("error");
    expect(errorOf(result).status).toBe(403);
  });
});
