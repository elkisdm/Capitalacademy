import { describe, it, expect, vi } from "vitest";

type CohortRow = { id: string; slug: string | null };
type EnrollmentRow = { cohort_id: string } | null;
type CohortRoleRow = { cohort_id: string } | null;
type ProfileRow = { system_role: string | null; role: string | null } | null;

/**
 * Arma un mock de `createAdminClient().from(table)` que reproduce el
 * encadenamiento real usado por `resolveViewerCohortForProgram`:
 * - cohorts: select().eq() -> { data, error }
 * - enrollments / cohort_roles: select().eq().in().in().limit().maybeSingle()
 * - profiles: select().eq().maybeSingle()
 */
function makeFromMock(options: {
  cohorts: CohortRow[] | null;
  enrollment?: EnrollmentRow;
  cohortRole?: CohortRoleRow;
  profile?: ProfileRow;
}) {
  const { cohorts, enrollment = null, cohortRole = null, profile = null } = options;

  return vi.fn((table: string) => {
    if (table === "cohorts") {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: cohorts, error: null }),
        }),
      };
    }
    if (table === "enrollments") {
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              in: () => ({
                limit: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: enrollment, error: null }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "cohort_roles") {
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              in: () => ({
                limit: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: cohortRole, error: null }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: profile, error: null }),
          }),
        }),
      };
    }
    throw new Error(`tabla no mockeada: ${table}`);
  });
}

async function loadModule(fromImpl: ReturnType<typeof makeFromMock>) {
  vi.resetModules();
  vi.doMock("@/lib/supabase/admin", () => ({
    createAdminClient: vi.fn(() => ({ from: fromImpl })),
  }));
  return import("@/lib/classroom/resolve-viewer-cohort");
}

describe("resolveViewerCohortForProgram", () => {
  it("devuelve null si el programa no tiene cohortes (data null)", async () => {
    const from = makeFromMock({ cohorts: null });
    const { resolveViewerCohortForProgram } = await loadModule(from);

    const result = await resolveViewerCohortForProgram("user-1", "prog-1");

    expect(result).toBeNull();
  });

  it("devuelve null si el programa no tiene cohortes (arreglo vacío)", async () => {
    const from = makeFromMock({ cohorts: [] });
    const { resolveViewerCohortForProgram } = await loadModule(from);

    const result = await resolveViewerCohortForProgram("user-1", "prog-1");

    expect(result).toBeNull();
  });

  it("prioriza la matrícula activa/completada sobre cualquier otro rol", async () => {
    const from = makeFromMock({
      cohorts: [
        { id: "cohort-1", slug: "g4" },
        { id: "cohort-2", slug: "g5" },
      ],
      enrollment: { cohort_id: "cohort-2" },
      // Aunque también tuviera cohort_role o fuera admin, la matrícula gana primero.
      cohortRole: { cohort_id: "cohort-1" },
      profile: { system_role: "admin", role: null },
    });
    const { resolveViewerCohortForProgram } = await loadModule(from);

    const result = await resolveViewerCohortForProgram("user-1", "prog-1");

    expect(result).toEqual({ id: "cohort-2", slug: "g5" });
  });

  it("usa el id como slug cuando la cohorte no tiene slug asignado", async () => {
    const from = makeFromMock({
      cohorts: [{ id: "cohort-1", slug: null }],
      enrollment: { cohort_id: "cohort-1" },
    });
    const { resolveViewerCohortForProgram } = await loadModule(from);

    const result = await resolveViewerCohortForProgram("user-1", "prog-1");

    expect(result).toEqual({ id: "cohort-1", slug: "cohort-1" });
  });

  it("cae a cohort_roles (docente/asistente) si no hay matrícula", async () => {
    const from = makeFromMock({
      cohorts: [{ id: "cohort-1", slug: "g4" }],
      enrollment: null,
      cohortRole: { cohort_id: "cohort-1" },
    });
    const { resolveViewerCohortForProgram } = await loadModule(from);

    const result = await resolveViewerCohortForProgram("teacher-1", "prog-1");

    expect(result).toEqual({ id: "cohort-1", slug: "g4" });
  });

  it("cae a staff transversal con system_role='admin' y devuelve la primera cohorte", async () => {
    const from = makeFromMock({
      cohorts: [
        { id: "cohort-1", slug: "g4" },
        { id: "cohort-2", slug: "g5" },
      ],
      enrollment: null,
      cohortRole: null,
      profile: { system_role: "admin", role: null },
    });
    const { resolveViewerCohortForProgram } = await loadModule(from);

    const result = await resolveViewerCohortForProgram("admin-1", "prog-1");

    expect(result).toEqual({ id: "cohort-1", slug: "g4" });
  });

  it("cae a staff transversal con system_role='ops'", async () => {
    const from = makeFromMock({
      cohorts: [{ id: "cohort-1", slug: "g4" }],
      enrollment: null,
      cohortRole: null,
      profile: { system_role: "ops", role: null },
    });
    const { resolveViewerCohortForProgram } = await loadModule(from);

    const result = await resolveViewerCohortForProgram("ops-1", "prog-1");

    expect(result).toEqual({ id: "cohort-1", slug: "g4" });
  });

  it("usa profile.role como fallback cuando system_role es null", async () => {
    const from = makeFromMock({
      cohorts: [{ id: "cohort-1", slug: "g4" }],
      enrollment: null,
      cohortRole: null,
      profile: { system_role: null, role: "admin" },
    });
    const { resolveViewerCohortForProgram } = await loadModule(from);

    const result = await resolveViewerCohortForProgram("admin-legacy-1", "prog-1");

    expect(result).toEqual({ id: "cohort-1", slug: "g4" });
  });

  it("devuelve null si el perfil no existe (maybeSingle sin datos)", async () => {
    const from = makeFromMock({
      cohorts: [{ id: "cohort-1", slug: "g4" }],
      enrollment: null,
      cohortRole: null,
      profile: null,
    });
    const { resolveViewerCohortForProgram } = await loadModule(from);

    const result = await resolveViewerCohortForProgram("nadie-1", "prog-1");

    expect(result).toBeNull();
  });

  it("devuelve null si el usuario no tiene matrícula, rol de cohorte ni system_role privilegiado", async () => {
    const from = makeFromMock({
      cohorts: [{ id: "cohort-1", slug: "g4" }],
      enrollment: null,
      cohortRole: null,
      profile: { system_role: "student", role: "student" },
    });
    const { resolveViewerCohortForProgram } = await loadModule(from);

    const result = await resolveViewerCohortForProgram("student-sin-acceso", "prog-1");

    expect(result).toBeNull();
  });
});
