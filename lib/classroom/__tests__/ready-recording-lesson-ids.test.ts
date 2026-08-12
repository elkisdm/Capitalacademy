import { describe, it, expect, vi } from "vitest";

// Captura los filtros aplicados: ids consultados y el "solo con playback".
const capturedIn: Array<[string, unknown]> = [];
const capturedNot: Array<[string, string, unknown]> = [];
const mockNot = vi.fn().mockResolvedValue({ data: [{ id: "a" }, { id: "c" }] });
const createAdminClientMock = vi.fn(() => ({
  from: () => ({
    select: () => ({
      in: (col: string, vals: unknown) => {
        capturedIn.push([col, vals]);
        return {
          not: (col2: string, op: string, val: unknown) => {
            capturedNot.push([col2, op, val]);
            return mockNot();
          },
        };
      },
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

const { getReadyRecordingLessonIds } = await import("@/lib/classroom/queries");

describe("getReadyRecordingLessonIds", () => {
  it("devuelve solo las lecciones con video listo en Mux", async () => {
    const result = await getReadyRecordingLessonIds(["a", "b", "c"]);
    expect(result).toEqual(new Set(["a", "c"]));
    expect(capturedIn).toContainEqual(["id", ["a", "b", "c"]]);
    expect(capturedNot).toContainEqual(["mux_playback_id", "is", null]);
  });

  it("lista vacía devuelve Set vacío sin llamar al client", async () => {
    createAdminClientMock.mockClear();
    const result = await getReadyRecordingLessonIds([]);
    expect(result).toEqual(new Set());
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("degrada a Set vacío si createAdminClient lanza", async () => {
    createAdminClientMock.mockImplementationOnce(() => {
      throw new Error("falta SUPABASE_SERVICE_ROLE_KEY");
    });
    const result = await getReadyRecordingLessonIds(["a"]);
    expect(result).toEqual(new Set());
  });

  it("degrada a Set vacío si el query falla", async () => {
    mockNot.mockRejectedValueOnce(new Error("PostgREST caído"));
    const result = await getReadyRecordingLessonIds(["a"]);
    expect(result).toEqual(new Set());
  });
});
