import { describe, it, expect } from "vitest";
import { creationBlockers, groupEvaluations, kindLabel, scopeLabel, type EvaluationRow } from "@/lib/admin/evaluation-list";

function makeRow(overrides: Partial<EvaluationRow>): EvaluationRow {
  return {
    id: "id",
    scope: "module",
    kind: "quiz",
    title: "Evaluación",
    is_active: false,
    opens_at: null,
    closes_at: null,
    weight_pct: null,
    questionCount: 0,
    moduleId: null,
    moduleTitle: null,
    lessonId: null,
    sessionId: null,
    targetLabel: null,
    ...overrides,
  };
}

describe("groupEvaluations", () => {
  it("pone la final primero, los módulos en el orden dado y 'Otras evaluaciones' al final", () => {
    const rows: EvaluationRow[] = [
      makeRow({ id: "m2", scope: "module", moduleId: "mod-2", moduleTitle: "Módulo 2" }),
      makeRow({ id: "other", scope: "session", moduleId: null, sessionId: "s1" }),
      makeRow({ id: "final", scope: "final" }),
      makeRow({ id: "m1", scope: "module", moduleId: "mod-1", moduleTitle: "Módulo 1" }),
    ];

    const groups = groupEvaluations(rows, ["mod-1", "mod-2"]);

    expect(groups.map((g) => g.key)).toEqual(["final", "mod-1", "mod-2", "other"]);
    expect(groups[0].title).toBe("Evaluación final");
    expect(groups.at(-1)!.title).toBe("Otras evaluaciones");
  });

  it("omite módulos sin ninguna evaluación", () => {
    const rows: EvaluationRow[] = [makeRow({ id: "m1", scope: "module", moduleId: "mod-1", moduleTitle: "Módulo 1" })];
    const groups = groupEvaluations(rows, ["mod-1", "mod-2", "mod-3"]);
    expect(groups.map((g) => g.key)).toEqual(["mod-1"]);
  });

  it("la suma de pesos es null cuando ninguna fila del grupo define weight_pct", () => {
    const rows: EvaluationRow[] = [
      makeRow({ id: "a", scope: "module", moduleId: "mod-1", moduleTitle: "Módulo 1", weight_pct: null }),
      makeRow({ id: "b", scope: "module", moduleId: "mod-1", moduleTitle: "Módulo 1", weight_pct: null }),
    ];
    const groups = groupEvaluations(rows, ["mod-1"]);
    expect(groups[0].weightTotal).toBeNull();
  });

  it("suma los pesos del grupo (25+50+25 = 100)", () => {
    const rows: EvaluationRow[] = [
      makeRow({ id: "a", scope: "module", moduleId: "mod-1", moduleTitle: "Módulo 1", weight_pct: 25 }),
      makeRow({ id: "b", scope: "module", moduleId: "mod-1", moduleTitle: "Módulo 1", weight_pct: 50 }),
      makeRow({ id: "c", scope: "module", moduleId: "mod-1", moduleTitle: "Módulo 1", weight_pct: 25 }),
    ];
    const groups = groupEvaluations(rows, ["mod-1"]);
    expect(groups[0].weightTotal).toBe(100);
    expect(groups[0].weightPartial).toBe(false);
  });

  it("marca weightPartial cuando solo algunas filas del grupo definen weight_pct", () => {
    const rows: EvaluationRow[] = [
      makeRow({ id: "a", scope: "module", moduleId: "mod-1", moduleTitle: "Módulo 1", weight_pct: 50 }),
      makeRow({ id: "b", scope: "module", kind: "quiz", moduleId: "mod-1", moduleTitle: "Módulo 1", weight_pct: null }),
    ];
    const groups = groupEvaluations(rows, ["mod-1"]);
    expect(groups[0].weightTotal).toBe(50);
    expect(groups[0].weightPartial).toBe(true);
  });

  it("weightPartial es false cuando todas las filas definen weight_pct (aunque no sumen 100)", () => {
    const rows: EvaluationRow[] = [
      makeRow({ id: "a", scope: "module", moduleId: "mod-1", moduleTitle: "Módulo 1", weight_pct: 50 }),
      makeRow({ id: "b", scope: "module", moduleId: "mod-1", moduleTitle: "Módulo 1", weight_pct: 30 }),
    ];
    const groups = groupEvaluations(rows, ["mod-1"]);
    expect(groups[0].weightTotal).toBe(80);
    expect(groups[0].weightPartial).toBe(false);
  });

  it("weightPartial es false cuando ninguna fila define weight_pct (weightTotal null)", () => {
    const rows: EvaluationRow[] = [
      makeRow({ id: "a", scope: "module", moduleId: "mod-1", moduleTitle: "Módulo 1", weight_pct: null }),
    ];
    const groups = groupEvaluations(rows, ["mod-1"]);
    expect(groups[0].weightTotal).toBeNull();
    expect(groups[0].weightPartial).toBe(false);
  });
});

describe("creationBlockers", () => {
  it("bloquea la final si ya existe una (activa o no)", () => {
    const blockers = creationBlockers([makeRow({ scope: "final" })]);
    expect(blockers.finalTaken).toBe(true);
  });

  it("no bloquea la final si no existe ninguna", () => {
    const blockers = creationBlockers([makeRow({ scope: "module", moduleId: "mod-1" })]);
    expect(blockers.finalTaken).toBe(false);
  });

  it("bloquea una lección que ya tiene evaluación", () => {
    const blockers = creationBlockers([makeRow({ scope: "lesson", lessonId: "lesson-1" })]);
    expect(blockers.lessonsTaken.has("lesson-1")).toBe(true);
    expect(blockers.lessonsTaken.has("lesson-2")).toBe(false);
  });

  it("bloquea una sesión que ya tiene evaluación", () => {
    const blockers = creationBlockers([makeRow({ scope: "session", sessionId: "session-1" })]);
    expect(blockers.sessionsTaken.has("session-1")).toBe(true);
  });

  it("un módulo con 3 evaluaciones manuales sigue disponible (nunca se bloquea)", () => {
    const blockers = creationBlockers([
      makeRow({ scope: "module", kind: "manual", moduleId: "mod-1", lessonId: null, sessionId: null }),
      makeRow({ scope: "module", kind: "manual", moduleId: "mod-1", lessonId: null, sessionId: null }),
      makeRow({ scope: "module", kind: "manual", moduleId: "mod-1", lessonId: null, sessionId: null }),
    ]);
    expect(blockers.finalTaken).toBe(false);
    expect(blockers.moduleQuizzesTaken.size).toBe(0);
    expect(blockers.lessonsTaken.size).toBe(0);
    expect(blockers.sessionsTaken.size).toBe(0);
  });

  it("bloquea un módulo que ya tiene un quiz, aunque sea borrador (is_active: false)", () => {
    const blockers = creationBlockers([
      makeRow({ scope: "module", kind: "quiz", moduleId: "mod-1", is_active: false, lessonId: null, sessionId: null }),
    ]);
    expect(blockers.moduleQuizzesTaken.has("mod-1")).toBe(true);
    expect(blockers.moduleQuizzesTaken.has("mod-2")).toBe(false);
  });

  it("una nota manual en un módulo NO bloquea ese módulo para un quiz", () => {
    const blockers = creationBlockers([
      makeRow({ scope: "module", kind: "manual", moduleId: "mod-1", lessonId: null, sessionId: null }),
    ]);
    expect(blockers.moduleQuizzesTaken.has("mod-1")).toBe(false);
  });
});

describe("scopeLabel / kindLabel", () => {
  it("traduce cada scope", () => {
    expect(scopeLabel("final")).toBe("Final del programa");
    expect(scopeLabel("module")).toBe("Del módulo");
    expect(scopeLabel("lesson")).toBe("De la lección");
    expect(scopeLabel("session")).toBe("De la clase en vivo");
  });

  it("traduce cada kind", () => {
    expect(kindLabel("quiz")).toBe("Quiz");
    expect(kindLabel("manual")).toBe("Nota manual");
  });
});
