import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureRecordingLesson } from "@/lib/classroom/ensure-recording-lesson";

/**
 * La lección-repetición es el punto donde se juntan el camino manual y la
 * grabación nativa (ADR-0034). Si los dos no producen EXACTAMENTE la misma
 * lección, el alumno ve dos "repeticiones" de la misma clase.
 */

type Result = { data?: unknown; error?: unknown };

let state: {
  lastPos: Result;
  slugRows: Result;
  insert: Result;
  link: Result;
};

let calls: Array<{ table: string; method: string; args: unknown[] }>;

function builder(table: string) {
  const propios: Array<{ method: string; args: unknown[] }> = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "eq", "order", "limit", "not"]) {
    b[m] = (...args: unknown[]) => {
      propios.push({ method: m, args });
      calls.push({ table, method: m, args });
      return b;
    };
  }
  const tiene = (m: string) => propios.some((c) => c.method === m);
  const arg0 = (m: string) => propios.find((c) => c.method === m)?.args[0];

  const resolve = (): Result => {
    if (table === "class_sessions") return state.link;
    if (tiene("insert")) return state.insert;
    if (tiene("delete")) return { error: null };
    if (arg0("select") === "position") return state.lastPos;
    return state.slugRows;
  };

  b.single = () => Promise.resolve(resolve());
  b.maybeSingle = () => Promise.resolve(resolve());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(res, rej);
  return b;
}

const admin = { from: (table: string) => builder(table) } as never;

const SESSION = {
  id: "ses-1",
  module_id: "mod-1",
  lesson_id: null,
  title: "Clase 3 — Evaluación",
};

beforeEach(() => {
  calls = [];
  state = {
    lastPos: { data: { position: 4 }, error: null },
    slugRows: { data: [{ slug: "repeticion-clase-3-evaluacion" }], error: null },
    insert: { data: { id: "lesson-nueva" }, error: null },
    link: { error: null },
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ensureRecordingLesson", () => {
  it("es idempotente: si la sesión ya tiene lección, no crea nada", async () => {
    const r = await ensureRecordingLesson(admin, { ...SESSION, lesson_id: "lesson-vieja" });

    expect(r).toEqual({ ok: true, lessonId: "lesson-vieja", created: false });
    expect(calls).toHaveLength(0);
  });

  it("crea la lección al final del módulo y la enlaza a la sesión", async () => {
    const r = await ensureRecordingLesson(admin, SESSION);

    expect(r).toEqual({ ok: true, lessonId: "lesson-nueva", created: true });

    const insert = calls.find((c) => c.method === "insert")!.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({
      module_id: "mod-1",
      kind: "recorded",
      title: "Repetición — Clase 3 — Evaluación",
      // Después de la última: unique(module_id, position).
      position: 5,
    });
    // El slug base ya estaba tomado, así que tiene que desempatar.
    expect(insert.slug).toBe("repeticion-clase-3-evaluacion-2");

    const link = calls.find((c) => c.table === "class_sessions" && c.method === "update")!;
    expect(link.args[0]).toEqual({ lesson_id: "lesson-nueva" });
  });

  it("la primera lección del módulo va en la posición 1", async () => {
    state.lastPos = { data: null, error: null };
    await ensureRecordingLesson(admin, SESSION);

    const insert = calls.find((c) => c.method === "insert")!.args[0] as { position: number };
    expect(insert.position).toBe(1);
  });

  it("usa un título por defecto cuando la clase no tiene uno", async () => {
    await ensureRecordingLesson(admin, { ...SESSION, title: null });

    const insert = calls.find((c) => c.method === "insert")!.args[0] as { title: string };
    expect(insert.title).toBe("Repetición — Clase en vivo");
  });

  it("sin módulo no crea una lección huérfana", async () => {
    // Una lección sin módulo no aparece en ninguna parte: nadie sabría que
    // existe, y la sesión quedaría enlazada a algo invisible.
    const r = await ensureRecordingLesson(admin, { ...SESSION, module_id: null });

    expect(r).toEqual({ ok: false, reason: "module_missing" });
    expect(calls).toHaveLength(0);
  });

  it("informa el fallo del insert sin enlazar nada", async () => {
    state.insert = { data: null, error: { message: "boom" } };
    const r = await ensureRecordingLesson(admin, SESSION);

    expect(r).toEqual({ ok: false, reason: "insert_error" });
    expect(calls.some((c) => c.table === "class_sessions" && c.method === "update")).toBe(false);
  });

  it("si el enlace falla, borra la lección para no dejar basura", async () => {
    state.link = { error: { message: "boom" } };
    const r = await ensureRecordingLesson(admin, SESSION);

    expect(r).toEqual({ ok: false, reason: "link_error" });
    const borrado = calls.find((c) => c.table === "lessons" && c.method === "delete");
    expect(borrado).toBeTruthy();
  });
});
