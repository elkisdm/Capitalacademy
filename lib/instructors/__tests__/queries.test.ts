import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Res = { data: unknown; error: unknown };

let instructorsResult: Res | (() => never);
let createClientImpl: () => unknown;
const calls: Array<{ method: string; args: unknown[] }> = [];

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    };
  }
  const resolve = () => {
    if (typeof instructorsResult === "function") return instructorsResult();
    return instructorsResult;
  };
  builder.maybeSingle = () => Promise.resolve(resolve());
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => createClientImpl()),
}));

const { getInstructorProfile, getInstructorIdsByProfileIds } = await import(
  "@/lib/instructors/queries"
);

const ID_A = "d0000000-0000-0000-0000-000000000001";
const ID_B = "d0000000-0000-0000-0000-000000000002";
const PROFILE_A = "e0000000-0000-0000-0000-0000000000aa";
const PROFILE_B = "e0000000-0000-0000-0000-0000000000bb";

const ROW = {
  id: ID_A,
  full_name: "Paola Vicuña",
  photo_url: null,
  bio: "Directora académica.",
  headline: "Directora Académica",
  linkedin_url: "https://linkedin.com/in/paola",
  instagram_url: null,
  website_url: null,
};

beforeEach(() => {
  calls.length = 0;
  instructorsResult = { data: null, error: null };
  createClientImpl = () => ({ from: () => makeBuilder() });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getInstructorProfile", () => {
  it("devuelve la ficha cuando la RLS la deja ver", async () => {
    instructorsResult = { data: ROW, error: null };
    await expect(getInstructorProfile(ID_A)).resolves.toEqual(ROW);
  });

  it("devuelve null cuando la RLS no devuelve fila (otro programa o id inexistente)", async () => {
    instructorsResult = { data: null, error: null };
    await expect(getInstructorProfile(ID_A)).resolves.toBeNull();
  });

  it("corta antes de tocar la base si el id no tiene forma de UUID", async () => {
    const spy = vi.fn();
    createClientImpl = () => {
      spy();
      return { from: () => makeBuilder() };
    };
    await expect(getInstructorProfile("../../etc/passwd")).resolves.toBeNull();
    await expect(getInstructorProfile("")).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("acepta UUIDs semilla que z.string().uuid() rechazaría", async () => {
    instructorsResult = { data: ROW, error: null };
    await expect(getInstructorProfile(ID_A)).resolves.toEqual(ROW);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "id")).toBe(true);
  });

  it("devuelve null y registra el error si el query falla", async () => {
    instructorsResult = { data: null, error: { code: "57014", message: "timeout" } };
    await expect(getInstructorProfile(ID_A)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "[getInstructorProfile] error leyendo instructors",
      expect.objectContaining({ code: "57014" }),
    );
  });

  it("no filtra por is_active: un docente dado de baja sigue teniendo ficha", async () => {
    instructorsResult = { data: ROW, error: null };
    await getInstructorProfile(ID_A);
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "is_active")).toBe(false);
  });
});

describe("getInstructorIdsByProfileIds", () => {
  it("mapea profile_id → instructor id", async () => {
    instructorsResult = {
      data: [
        { id: ID_A, profile_id: PROFILE_A },
        { id: ID_B, profile_id: PROFILE_B },
      ],
      error: null,
    };
    const map = await getInstructorIdsByProfileIds([PROFILE_A, PROFILE_B]);
    expect(map.get(PROFILE_A)).toBe(ID_A);
    expect(map.get(PROFILE_B)).toBe(ID_B);
  });

  it("con dos fichas del mismo profile_id gana la primera (orden por created_at)", async () => {
    instructorsResult = {
      data: [
        { id: ID_A, profile_id: PROFILE_A },
        { id: ID_B, profile_id: PROFILE_A },
      ],
      error: null,
    };
    const map = await getInstructorIdsByProfileIds([PROFILE_A]);
    expect(map.size).toBe(1);
    expect(map.get(PROFILE_A)).toBe(ID_A);
    expect(
      calls.some(
        (c) =>
          c.method === "order" &&
          c.args[0] === "created_at" &&
          (c.args[1] as { ascending?: boolean }).ascending === true,
      ),
    ).toBe(true);
  });

  it("ignora filas sin profile_id", async () => {
    instructorsResult = { data: [{ id: ID_A, profile_id: null }], error: null };
    await expect(getInstructorIdsByProfileIds([PROFILE_A])).resolves.toEqual(new Map());
  });

  it("solo trae instructores activos", async () => {
    instructorsResult = { data: [], error: null };
    await getInstructorIdsByProfileIds([PROFILE_A]);
    expect(
      calls.some((c) => c.method === "eq" && c.args[0] === "is_active" && c.args[1] === true),
    ).toBe(true);
  });

  it("no consulta con lista vacía ni con ids inválidos", async () => {
    const spy = vi.fn();
    createClientImpl = () => {
      spy();
      return { from: () => makeBuilder() };
    };
    await expect(getInstructorIdsByProfileIds([])).resolves.toEqual(new Map());
    await expect(getInstructorIdsByProfileIds(["", "no-uuid"])).resolves.toEqual(new Map());
    expect(spy).not.toHaveBeenCalled();
  });

  it("deduplica los ids repetidos antes de consultar", async () => {
    instructorsResult = { data: [], error: null };
    await getInstructorIdsByProfileIds([PROFILE_A, PROFILE_A, PROFILE_A]);
    const inCall = calls.find((c) => c.method === "in");
    expect(inCall?.args[1]).toEqual([PROFILE_A]);
  });

  it("degrada a Map vacío si el query revienta", async () => {
    instructorsResult = () => {
      throw new Error("network down");
    };
    await expect(getInstructorIdsByProfileIds([PROFILE_A])).resolves.toEqual(new Map());
    expect(console.error).toHaveBeenCalledWith(
      "[getInstructorIdsByProfileIds] degradando (sin enlace al perfil)",
      expect.any(Error),
    );
  });

  it("degrada a Map vacío si data viene null", async () => {
    instructorsResult = { data: null, error: null };
    await expect(getInstructorIdsByProfileIds([PROFILE_A])).resolves.toEqual(new Map());
  });
});
