import { describe, it, expect, vi } from "vitest";

// Captura el filtro de status que aplica getEnrollmentForUser.
const capturedIn: Array<[string, unknown]> = [];
const mockMaybeSingle = vi
  .fn()
  .mockResolvedValue({ data: { id: "e1", status: "completed", cohort_id: "c1", student_id: "u1" } });

const mockCohortSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "cohorts") {
        return {
          select: () => ({
            eq: () => ({
              single: mockCohortSingle,
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: (col: string, vals: unknown) => {
                capturedIn.push([col, vals]);
                return { maybeSingle: mockMaybeSingle };
              },
            }),
          }),
        }),
      };
    },
  })),
}));

const { getEnrollmentForUser, getCohortWithProgram } = await import(
  "@/lib/classroom/queries"
);

describe("getEnrollmentForUser — acceso permanente (RN-049/050, RN-T03)", () => {
  it("concede acceso al contenido para matrículas 'active' Y 'completed', no solo activas", async () => {
    const result = await getEnrollmentForUser("u1", "c1");
    expect(result).toEqual({
      id: "e1",
      status: "completed",
      cohort_id: "c1",
      student_id: "u1",
    });
    // El estado académico 'completed' no debe expulsar al alumno del aula.
    expect(capturedIn).toContainEqual(["status", ["active", "completed"]]);
  });
});

describe("getCohortWithProgram — manejo de errores", () => {
  it("devuelve null sin lanzar cuando la cohorte no existe (PGRST116, 0 filas)", async () => {
    mockCohortSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST116", message: "0 rows" },
    });

    const result = await getCohortWithProgram("c-no-existe");
    expect(result).toBeNull();
  });

  it("lanza cuando el error es transitorio (57014, statement timeout)", async () => {
    mockCohortSingle.mockResolvedValueOnce({
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout" },
    });

    await expect(getCohortWithProgram("c1")).rejects.toBeTruthy();
  });
});
