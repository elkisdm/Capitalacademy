import { describe, it, expect } from "vitest";
import { resolveRef } from "../ref";

/**
 * Decide con qué columna se busca la fila. Si se equivoca, la pantalla "no
 * existe" — un 404 en la cara de alguien que siguió un enlace válido.
 */

const UUID = "6f2a1b3c-4d5e-4f60-8a1b-2c3d4e5f6071";

describe("resolveRef", () => {
  it("reconoce un UUID y busca por id", () => {
    expect(resolveRef(UUID)).toEqual({ column: "id", value: UUID });
  });

  it("acepta el UUID en mayúsculas sin cambiarle la caja", () => {
    // Postgres compara uuid por valor, no por texto: no hay que normalizarlo.
    const alto = UUID.toUpperCase();
    expect(resolveRef(alto)).toEqual({ column: "id", value: alto });
  });

  it("reconoce un slug y lo normaliza a minúsculas", () => {
    expect(resolveRef("Paola-Vicuna")).toEqual({ column: "slug", value: "paola-vicuna" });
  });

  it("acepta slugs con números y sufijo de id", () => {
    expect(resolveRef("clase-legal-3fd1c1")?.column).toBe("slug");
    expect(resolveRef("hilo-9b1c2d3e")?.column).toBe("slug");
  });

  it("recorta espacios de un copiar/pegar", () => {
    expect(resolveRef("  paola-vicuna  ")).toEqual({ column: "slug", value: "paola-vicuna" });
  });

  it("rechaza lo que no es ni slug ni UUID", () => {
    // Importa que sea null y no que llegue a la consulta: buscar basura en una
    // columna uuid es un 500 de Postgres, no el 404 que corresponde.
    for (const malo of ["../../etc/passwd", "' or 1=1 --", "con espacios", "MAYÚSCULAS_Y_Ñ", "", null, undefined]) {
      expect(resolveRef(malo)).toBeNull();
    }
  });

  it("rechaza guiones sueltos en los bordes o repetidos", () => {
    expect(resolveRef("-paola")).toBeNull();
    expect(resolveRef("paola-")).toBeNull();
    expect(resolveRef("paola--vicuna")).toBeNull();
  });

  it("rechaza un slug absurdamente largo", () => {
    expect(resolveRef("a".repeat(121))).toBeNull();
  });
});
