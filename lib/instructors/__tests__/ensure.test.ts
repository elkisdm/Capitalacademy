import { describe, it, expect, vi } from "vitest";
import { ensureInstructorForProfile } from "@/lib/instructors/ensure";

type Result = { data: unknown; error?: unknown };

/**
 * Cliente falso con la forma exacta que usa el helper: la lectura de la ficha
 * encadena `.eq().order().limit().maybeSingle()` y la del perfil `.eq().maybeSingle()`.
 */
function fakeClient(opts: {
  instructorLookup?: Result;
  profileLookup?: Result;
  insertResult?: Result;
  insertSpy?: (row: unknown) => void;
}) {
  return {
    from(table: string) {
      if (table === "instructors") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () =>
                    Promise.resolve(opts.instructorLookup ?? { data: null }),
                }),
              }),
            }),
          }),
          insert: (row: unknown) => {
            opts.insertSpy?.(row);
            return {
              select: () => ({
                single: () => Promise.resolve(opts.insertResult ?? { data: null }),
              }),
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve(opts.profileLookup ?? { data: null }),
            }),
          }),
        };
      }
      throw new Error(`tabla no mockeada: ${table}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const PROFILE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-555555555555";

describe("ensureInstructorForProfile", () => {
  it("devuelve la ficha existente sin crear otra", async () => {
    const insertSpy = vi.fn();
    const client = fakeClient({
      instructorLookup: { data: { id: "inst-1", full_name: "Paola Vicuña" } },
      insertSpy,
    });

    const res = await ensureInstructorForProfile(client, PROFILE_ID);

    expect(res.error).toBeNull();
    expect(res.data).toEqual({ id: "inst-1", full_name: "Paola Vicuña", created: false });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("crea la ficha copiando el nombre de la cuenta", async () => {
    const insertSpy = vi.fn();
    const client = fakeClient({
      instructorLookup: { data: null },
      profileLookup: { data: { full_name: "  Cristian Farias  " } },
      insertResult: { data: { id: "inst-2", full_name: "Cristian Farias" }, error: null },
      insertSpy,
    });

    const res = await ensureInstructorForProfile(client, PROFILE_ID);

    expect(res.data).toEqual({ id: "inst-2", full_name: "Cristian Farias", created: true });
    // El nombre se recorta y la ficha nace activa; nada más se copia del perfil.
    expect(insertSpy).toHaveBeenCalledWith({
      full_name: "Cristian Farias",
      profile_id: PROFILE_ID,
      is_active: true,
    });
  });

  it("un fallo de lectura NO se degrada a 'no existe': no duplica la identidad", async () => {
    const insertSpy = vi.fn();
    const client = fakeClient({
      instructorLookup: { data: null, error: { message: "statement timeout" } },
      insertSpy,
    });

    const res = await ensureInstructorForProfile(client, PROFILE_ID);

    expect(res.data).toBeNull();
    expect(res.error).toBe("statement timeout");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("no crea ficha si la cuenta no existe", async () => {
    const insertSpy = vi.fn();
    const client = fakeClient({ profileLookup: { data: null }, insertSpy });

    const res = await ensureInstructorForProfile(client, PROFILE_ID);

    expect(res.data).toBeNull();
    expect(res.error).toBe("La cuenta no existe");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("no crea una ficha sin nombre", async () => {
    const insertSpy = vi.fn();
    const client = fakeClient({ profileLookup: { data: { full_name: "   " } }, insertSpy });

    const res = await ensureInstructorForProfile(client, PROFILE_ID);

    expect(res.error).toBe("La cuenta no tiene nombre");
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("propaga el error del insert en vez de fingir que quedó creada", async () => {
    const client = fakeClient({
      profileLookup: { data: { full_name: "Julio Fontecilla" } },
      insertResult: { data: null, error: { message: "new row violates row-level security" } },
    });

    const res = await ensureInstructorForProfile(client, PROFILE_ID);

    expect(res.data).toBeNull();
    expect(res.error).toContain("row-level security");
  });
});
