import { describe, it, expect, vi } from "vitest";

// Captura los lesson_id consultados en class_sessions.
const capturedIn: Array<[string, unknown]> = [];
const mockSelect = vi.fn().mockResolvedValue({
  data: [{ lesson_id: "a" }, { lesson_id: null }, { lesson_id: "b" }],
});
const createAdminClientMock = vi.fn(() => ({
  from: () => ({
    select: () => ({
      in: (col: string, vals: unknown) => {
        capturedIn.push([col, vals]);
        return mockSelect();
      },
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

const { getSessionRecordingLessonIds } = await import("@/lib/classroom/queries");

describe("getSessionRecordingLessonIds", () => {
  it("resuelve las filas a un Set de lesson_id, descartando null", async () => {
    const result = await getSessionRecordingLessonIds(["a", "b", "c"]);
    expect(result).toEqual(new Set(["a", "b"]));
    expect(capturedIn).toContainEqual(["lesson_id", ["a", "b", "c"]]);
  });

  it("lista vacía devuelve Set vacío sin llamar al client", async () => {
    createAdminClientMock.mockClear();
    const result = await getSessionRecordingLessonIds([]);
    expect(result).toEqual(new Set());
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("degrada a Set vacío si createAdminClient lanza", async () => {
    createAdminClientMock.mockImplementationOnce(() => {
      throw new Error("falta SUPABASE_SERVICE_ROLE_KEY");
    });
    const result = await getSessionRecordingLessonIds(["a"]);
    expect(result).toEqual(new Set());
  });
});
