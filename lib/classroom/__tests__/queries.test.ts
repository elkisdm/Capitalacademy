import { describe, it, expect, vi } from "vitest";

// Captura el filtro de status que aplica getEnrollmentForUser.
const capturedIn: Array<[string, unknown]> = [];
const mockMaybeSingle = vi
  .fn()
  .mockResolvedValue({ data: { id: "e1", status: "completed", cohort_id: "c1", student_id: "u1" } });

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
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
    }),
  })),
}));

const { getEnrollmentForUser } = await import("@/lib/classroom/queries");

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
