import { describe, it, expect } from "vitest";
import { resolveTourStart } from "../start";

describe("resolveTourStart", () => {
  const base = {
    forced: false,
    isStaff: false,
    completedAt: null as string | null,
    readFailed: false,
  };

  it("arranca solo la primera vez del alumno", () => {
    expect(resolveTourStart(base)).toBe("auto");
  });

  it("no arranca si el alumno ya lo cerró", () => {
    expect(resolveTourStart({ ...base, completedAt: "2026-08-01T12:00:00Z" })).toBe("off");
  });

  it("no arranca solo para staff ni docentes", () => {
    expect(resolveTourStart({ ...base, isStaff: true })).toBe("off");
  });

  it("se relanza cuando el alumno lo pide desde el Centro de ayuda", () => {
    expect(resolveTourStart({ ...base, forced: true })).toBe("forced");
  });

  it("el relanzamiento explícito gana aunque ya lo haya cerrado", () => {
    expect(
      resolveTourStart({ ...base, forced: true, completedAt: "2026-08-01T12:00:00Z" }),
    ).toBe("forced");
  });

  // El escenario que motiva la función: código desplegado antes de la migración
  // 0088, o timeout de RLS sobre `profiles`. Sin este corte el tour se le
  // dispararía a toda la matrícula en cada carga y no podría persistir el cierre.
  it("NO arranca si la lectura de profiles falló", () => {
    expect(resolveTourStart({ ...base, readFailed: true })).toBe("off");
  });

  it("un relanzamiento pedido a mano sigue funcionando con la lectura rota", () => {
    expect(resolveTourStart({ ...base, forced: true, readFailed: true })).toBe("forced");
  });
});
