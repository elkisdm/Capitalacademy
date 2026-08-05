import { describe, it, expect } from "vitest";
import {
  STUDENT_TOUR_STEPS,
  resolveTourSteps,
  stepCounterLabel,
  clampStepIndex,
} from "@/lib/tour/steps";
import type { TourStep } from "@/lib/tour/types";

const step = (id: string, target: string | null): TourStep => ({
  id,
  target,
  title: `Título ${id}`,
  body: `Cuerpo ${id}`,
});

describe("STUDENT_TOUR_STEPS", () => {
  it("tiene ids únicos", () => {
    const ids = STUDENT_TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no repite un mismo anclaje en dos pasos", () => {
    const targets = STUDENT_TOUR_STEPS.map((s) => s.target).filter(
      (t): t is string => t !== null,
    );
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("cada paso tiene título y cuerpo no vacíos", () => {
    for (const s of STUDENT_TOUR_STEPS) {
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(s.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("empieza y termina con un paso centrado, sin anclaje", () => {
    expect(STUDENT_TOUR_STEPS[0].target).toBeNull();
    expect(STUDENT_TOUR_STEPS[STUDENT_TOUR_STEPS.length - 1].target).toBeNull();
  });

  it("los enlaces del guion son rutas internas", () => {
    for (const s of STUDENT_TOUR_STEPS) {
      if (!s.link) continue;
      expect(s.link.href.startsWith("/")).toBe(true);
      expect(s.link.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("mantiene juntos los pasos de menú, para que sobreviva exactamente uno por viewport", () => {
    const escritorio = STUDENT_TOUR_STEPS.findIndex((s) => s.target === "menu");
    const movil = STUDENT_TOUR_STEPS.findIndex((s) => s.target === "menu-movil");
    expect(escritorio).toBeGreaterThanOrEqual(0);
    expect(movil).toBe(escritorio + 1);
  });

  it("en escritorio deja 7 pasos y en teléfono 6, sin duplicar el menú", () => {
    // Anclajes que solo existen en el sidebar de escritorio (`hidden md:flex`).
    const SOLO_ESCRITORIO = new Set(["menu", "ayuda"]);

    // Escritorio: se ve el sidebar, el header móvil mide 0×0.
    const escritorio = resolveTourSteps(
      STUDENT_TOUR_STEPS,
      (t) => t !== "menu-movil",
    );
    expect(escritorio.map((s) => s.id)).toEqual([
      "bienvenida",
      "menu",
      "ayuda",
      "progreso",
      "continuar",
      "ruta",
      "cierre",
    ]);

    // Teléfono: el sidebar de escritorio mide 0×0, se ve la hamburguesa y todo
    // el contenido del dashboard.
    const movil = resolveTourSteps(
      STUDENT_TOUR_STEPS,
      (t) => !SOLO_ESCRITORIO.has(t),
    );
    expect(movil.map((s) => s.id)).toEqual([
      "bienvenida",
      "menu-movil",
      "progreso",
      "continuar",
      "ruta",
      "cierre",
    ]);
  });
});

describe("resolveTourSteps", () => {
  it("conserva siempre los pasos sin anclaje", () => {
    const steps = [step("a", null), step("b", "x"), step("c", null)];
    const out = resolveTourSteps(steps, () => false);
    expect(out.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("saca los pasos cuyo elemento no está visible", () => {
    const steps = [step("a", "visible"), step("b", "oculto")];
    const out = resolveTourSteps(steps, (t) => t === "visible");
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });

  it("conserva el orden original", () => {
    const steps = [step("a", "x"), step("b", null), step("c", "y")];
    const out = resolveTourSteps(steps, () => true);
    expect(out.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("no consulta la visibilidad de los pasos sin anclaje", () => {
    const consultados: string[] = [];
    resolveTourSteps([step("a", null), step("b", "x")], (t) => {
      consultados.push(t);
      return true;
    });
    expect(consultados).toEqual(["x"]);
  });

  it("con todo invisible devuelve solo los centrados", () => {
    const out = resolveTourSteps(STUDENT_TOUR_STEPS, () => false);
    expect(out.map((s) => s.id)).toEqual(["bienvenida", "cierre"]);
  });

  it("devuelve lista vacía si no hay pasos", () => {
    expect(resolveTourSteps([], () => true)).toEqual([]);
  });
});

describe("stepCounterLabel", () => {
  it("cuenta desde 1 aunque el índice sea base 0", () => {
    expect(stepCounterLabel(0, 7)).toBe("Paso 1 de 7");
    expect(stepCounterLabel(6, 7)).toBe("Paso 7 de 7");
  });
});

describe("clampStepIndex", () => {
  it("deja pasar un índice dentro de rango", () => {
    expect(clampStepIndex(3, 7)).toBe(3);
  });

  it("acota por abajo", () => {
    expect(clampStepIndex(-1, 7)).toBe(0);
  });

  it("acota por arriba", () => {
    expect(clampStepIndex(9, 7)).toBe(6);
  });

  it("devuelve 0 cuando no hay pasos", () => {
    expect(clampStepIndex(3, 0)).toBe(0);
    expect(clampStepIndex(3, -1)).toBe(0);
  });
});
