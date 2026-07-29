import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { resolveAudience, AUDIENCE_STATUSES } from "@/lib/campaigns/audience";

type Row = {
  student_id: string;
  profiles: { email: string | null; full_name: string | null; role: string | null } | null;
};

let rows: Row[];
let queryError: { message?: string } | null;
const calls: Array<{ method: string; args: unknown[] }> = [];

/** Doble encadenable que registra los filtros aplicados. */
function makeClient(): SupabaseClient<Database> {
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "in"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: queryError }).then(res, rej);

  return {
    from: () => ({ select: () => builder }),
  } as unknown as SupabaseClient<Database>;
}

function student(id: string, email: string, name = "Alumno Uno"): Row {
  return { student_id: id, profiles: { email, full_name: name, role: "student" } };
}

beforeEach(() => {
  rows = [];
  queryError = null;
  calls.length = 0;
  vi.clearAllMocks();
});

describe("resolveAudience", () => {
  it("devuelve los alumnos con correo, normalizado a minúsculas", async () => {
    rows = [student("s1", "Ana@Example.com", "Ana Pérez")];

    const result = await resolveAudience(makeClient(), { programId: "p1" });

    expect(result).toEqual([{ studentId: "s1", email: "ana@example.com", fullName: "Ana Pérez" }]);
  });

  it("excluye al staff aunque tenga matrícula", async () => {
    rows = [
      student("s1", "alumna@x.cl"),
      { student_id: "s2", profiles: { email: "ops@x.cl", full_name: "Ops", role: "ops" } },
      { student_id: "s3", profiles: { email: "profe@x.cl", full_name: "Profe", role: "teacher" } },
      { student_id: "s4", profiles: { email: "admin@x.cl", full_name: "Admin", role: "admin" } },
    ];

    const result = await resolveAudience(makeClient(), { programId: "p1" });

    expect(result.map((r) => r.email)).toEqual(["alumna@x.cl"]);
  });

  it("descarta filas sin correo o sin perfil", async () => {
    rows = [
      { student_id: "s1", profiles: { email: null, full_name: "Sin correo", role: "student" } },
      { student_id: "s2", profiles: null },
      student("s3", "ok@x.cl"),
    ];

    expect(await resolveAudience(makeClient(), { programId: "p1" })).toHaveLength(1);
  });

  // Una misma persona con dos matrículas en el programa (dos generaciones) no
  // debe recibir el comunicado dos veces.
  it("deduplica por correo", async () => {
    rows = [student("s1", "ana@x.cl"), student("s2", "ANA@x.cl")];

    const result = await resolveAudience(makeClient(), { programId: "p1" });

    expect(result).toHaveLength(1);
    expect(result[0].studentId).toBe("s1");
  });

  it("filtra por programa y por estado activo por defecto", async () => {
    await resolveAudience(makeClient(), { programId: "p1" });

    expect(calls).toContainEqual({ method: "eq", args: ["cohorts.program_id", "p1"] });
    expect(calls).toContainEqual({ method: "in", args: ["status", ["active"]] });
  });

  it("acepta varios estados de matrícula", async () => {
    await resolveAudience(makeClient(), { programId: "p1", statuses: ["active", "completed"] });

    expect(calls).toContainEqual({ method: "in", args: ["status", ["active", "completed"]] });
  });

  it("ignora una lista de estados vacía y vuelve al default", async () => {
    await resolveAudience(makeClient(), { programId: "p1", statuses: [] });

    expect(calls).toContainEqual({ method: "in", args: ["status", ["active"]] });
  });

  it("aplica el filtro de cohorte solo si se pide", async () => {
    await resolveAudience(makeClient(), { programId: "p1" });
    expect(calls.some((c) => c.args[0] === "cohort_id")).toBe(false);

    calls.length = 0;
    await resolveAudience(makeClient(), { programId: "p1", cohortId: "c1" });
    expect(calls).toContainEqual({ method: "eq", args: ["cohort_id", "c1"] });
  });

  it("aplica el filtro de segmento solo si se pide", async () => {
    await resolveAudience(makeClient(), { programId: "p1", segment: "capital_inteligente" });

    expect(calls).toContainEqual({ method: "eq", args: ["segment", "capital_inteligente"] });
  });

  it("propaga el error de la query con contexto", async () => {
    queryError = { message: "boom" };

    await expect(resolveAudience(makeClient(), { programId: "p1" })).rejects.toThrow(
      /No se pudo resolver la audiencia: boom/,
    );
  });

  it("no revienta con data nula", async () => {
    rows = null as unknown as Row[];

    expect(await resolveAudience(makeClient(), { programId: "p1" })).toEqual([]);
  });
});

describe("AUDIENCE_STATUSES", () => {
  it("no ofrece 'dropped' como audiencia de un envío", () => {
    expect(AUDIENCE_STATUSES).not.toContain("dropped");
  });
});
