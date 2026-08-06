import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Traduce el slug de la URL al id real. Lo usa CADA pantalla del aula: si falla,
 * no es una función la que se cae, es el classroom entero.
 */

/** Consultas hechas, para verificar el orden slug → id. */
const consultas: Array<{ tabla: string; columna: string; valor: string }> = [];
let porSlug: { id: string } | null = null;
let porId: { id: string } | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => ({
      select: () => ({
        eq: (columna: string, valor: string) => ({
          single: async () => {
            consultas.push({ tabla, columna, valor });
            return { data: columna === "slug" ? porSlug : porId };
          },
        }),
      }),
    }),
  }),
}));

const { resolveCohortSlug, resolveModuleSlug, resolveLessonSlug } = await import(
  "@/lib/classroom/resolve-slugs"
);

beforeEach(() => {
  consultas.length = 0;
  porSlug = null;
  porId = null;
});

describe("resolveCohortSlug", () => {
  it("resuelve por slug y no consulta por id si lo encontró", async () => {
    porSlug = { id: "c1" };

    await expect(resolveCohortSlug("diplomado-iv-generacion")).resolves.toBe("c1");
    expect(consultas).toEqual([
      { tabla: "cohorts", columna: "slug", valor: "diplomado-iv-generacion" },
    ]);
  });

  it("cae a buscar por id cuando el slug no existe", async () => {
    // Los enlaces viejos llevan el id crudo y tienen que seguir abriendo.
    porId = { id: "c1" };

    await expect(resolveCohortSlug("c1")).resolves.toBe("c1");
    expect(consultas.map((c) => c.columna)).toEqual(["slug", "id"]);
  });

  it("devuelve null cuando no existe por ninguna de las dos", async () => {
    await expect(resolveCohortSlug("no-existe")).resolves.toBeNull();
    expect(consultas).toHaveLength(2);
  });
});

describe("resolveModuleSlug", () => {
  it("consulta la tabla de módulos", async () => {
    porSlug = { id: "m1" };

    await expect(resolveModuleSlug("modulo-1")).resolves.toBe("m1");
    expect(consultas[0].tabla).toBe("program_modules");
  });
});

describe("resolveLessonSlug", () => {
  it("consulta la tabla de lecciones", async () => {
    porSlug = { id: "l1" };

    await expect(resolveLessonSlug("clase-1")).resolves.toBe("l1");
    expect(consultas[0].tabla).toBe("lessons");
  });
});
