import { describe, it, expect, vi, beforeEach } from "vitest";

// cookies() de next/headers: simulamos el store con un mapa mutable por test.
let cookieMap: Record<string, string>;

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      cookieMap[name] !== undefined ? { value: cookieMap[name] } : undefined,
  })),
}));

// createClient() de lib/supabase/server: solo necesita from("programs").select().order()
let programsResult: { data: unknown };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "programs") {
        return {
          select: () => ({
            order: () => Promise.resolve(programsResult),
          }),
        };
      }
      throw new Error(`tabla inesperada en el mock: ${table}`);
    },
  })),
}));

import {
  getActiveEnv,
  getViewMode,
  getEnvOptions,
  resolveProgramScope,
  ENV_COOKIE,
  VIEW_MODE_COOKIE,
} from "@/lib/admin/active-env";

describe("getActiveEnv", () => {
  beforeEach(() => {
    cookieMap = {};
  });

  it("devuelve el program_id cuando la cookie tiene un valor válido", async () => {
    cookieMap[ENV_COOKIE] = "prog-1";
    expect(await getActiveEnv()).toBe("prog-1");
  });

  it("devuelve null cuando la cookie es 'all' (Todos los entornos)", async () => {
    cookieMap[ENV_COOKIE] = "all";
    expect(await getActiveEnv()).toBeNull();
  });

  it("devuelve null cuando la cookie no existe", async () => {
    expect(await getActiveEnv()).toBeNull();
  });
});

describe("getViewMode", () => {
  beforeEach(() => {
    cookieMap = {};
  });

  it("devuelve 'student' cuando la cookie vale exactamente 'student'", async () => {
    cookieMap[VIEW_MODE_COOKIE] = "student";
    expect(await getViewMode()).toBe("student");
  });

  it("devuelve 'admin' por defecto cuando la cookie no existe", async () => {
    expect(await getViewMode()).toBe("admin");
  });

  it("devuelve 'admin' cuando la cookie tiene un valor distinto de 'student'", async () => {
    cookieMap[VIEW_MODE_COOKIE] = "otro-valor";
    expect(await getViewMode()).toBe("admin");
  });
});

describe("getEnvOptions", () => {
  it("devuelve la lista de programas cuando Supabase responde con datos", async () => {
    programsResult = { data: [{ id: "p1", name: "Diplomado" }] };
    expect(await getEnvOptions()).toEqual([{ id: "p1", name: "Diplomado" }]);
  });

  it("devuelve arreglo vacío cuando Supabase responde data: null", async () => {
    programsResult = { data: null };
    expect(await getEnvOptions()).toEqual([]);
  });
});

describe("resolveProgramScope", () => {
  const options = [
    { id: "p1", name: "Diplomado" },
    { id: "p2", name: "Liderazgo" },
  ];

  it("devuelve null cuando no hay programas disponibles", () => {
    expect(resolveProgramScope("p1", "p2", [])).toBeNull();
  });

  it("prioriza el param de la URL cuando es un id válido", () => {
    expect(resolveProgramScope("p2", "p1", options)).toBe("p2");
  });

  it("cae a la cookie cuando el param no coincide con ningún programa", () => {
    expect(resolveProgramScope("no-existe", "p2", options)).toBe("p2");
  });

  it("cae al primer programa cuando ni el param ni la cookie coinciden", () => {
    expect(resolveProgramScope("no-existe", "tampoco-existe", options)).toBe("p1");
  });

  it("cae al primer programa cuando param es undefined y cookie es null", () => {
    expect(resolveProgramScope(undefined, null, options)).toBe("p1");
  });
});
