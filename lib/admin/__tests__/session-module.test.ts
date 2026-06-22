import { describe, it, expect } from "vitest";
import { moduleInProgramError } from "@/lib/admin/session-module";

// Mock mínimo del admin client: solo necesita .from().select().eq().single().
function fakeAdmin(moduleRow: { program_id: string } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: moduleRow, error: null }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof moduleInProgramError>[0];
}

const PROGRAM_A = "aaaaaaaa-bbbb-4ccc-8ddd-111111111111";
const PROGRAM_B = "aaaaaaaa-bbbb-4ccc-8ddd-999999999999";
const MODULE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-222222222222";

describe("moduleInProgramError", () => {
  it("devuelve null cuando no se asigna módulo (null/undefined)", async () => {
    expect(await moduleInProgramError(fakeAdmin(null), PROGRAM_A, null)).toBeNull();
    expect(
      await moduleInProgramError(fakeAdmin(null), PROGRAM_A, undefined),
    ).toBeNull();
  });

  it("devuelve null cuando el módulo pertenece al programa", async () => {
    const admin = fakeAdmin({ program_id: PROGRAM_A });
    expect(await moduleInProgramError(admin, PROGRAM_A, MODULE_ID)).toBeNull();
  });

  it("devuelve error cuando el módulo es de otro programa", async () => {
    const admin = fakeAdmin({ program_id: PROGRAM_B });
    const err = await moduleInProgramError(admin, PROGRAM_A, MODULE_ID);
    expect(err).toContain("no pertenece");
  });

  it("devuelve error cuando el módulo no existe", async () => {
    const admin = fakeAdmin(null);
    const err = await moduleInProgramError(admin, PROGRAM_A, MODULE_ID);
    expect(err).toContain("no existe");
  });
});
