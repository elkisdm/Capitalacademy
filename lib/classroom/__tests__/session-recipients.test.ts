import { describe, it, expect } from "vitest";
import { getSessionRecipients } from "@/lib/classroom/session-recipients";

type Fila = {
  student_id: string;
  profiles: { email: string; full_name: string | null; account_type: string } | null;
};

/** Doble del cliente: devuelve `filas` y registra los filtros encadenados. */
function fakeAdmin(filas: Fila[]) {
  const filtros: [string, ...unknown[]][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["eq", "order"]) {
    chain[m] = (...args: unknown[]) => {
      filtros.push([m, ...args] as [string, ...unknown[]]);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: filas, error: null }).then(resolve);
  return {
    admin: { from: () => ({ select: () => chain }) },
    filtros,
  };
}

function alumno(id: string, email: string, accountType = "real"): Fila {
  return { student_id: id, profiles: { email, full_name: id, account_type: accountType } };
}

const TODOS = [
  alumno("stu-1", "uno@test.cl"),
  alumno("stu-2", "dos@test.cl"),
  alumno("stu-3", "tres@test.cl"),
];

describe("getSessionRecipients", () => {
  it("convoca a toda la cohorte cuando no hay lista", async () => {
    const { admin } = fakeAdmin(TODOS);
    const r = await getSessionRecipients(admin as never, { cohort_id: "c1" });
    expect(r.map((x) => x.email)).toEqual(["uno@test.cl", "dos@test.cl", "tres@test.cl"]);
  });

  describe("convocatoria parcial", () => {
    it("escribe solo a las personas citadas a esa sesión", async () => {
      // El caso real: el examen de Role Play del 29-ago cita a 10 de 19.
      const { admin } = fakeAdmin(TODOS);
      const r = await getSessionRecipients(admin as never, {
        cohort_id: "c1",
        attendee_student_ids: ["stu-1", "stu-3"],
      });
      expect(r.map((x) => x.email)).toEqual(["uno@test.cl", "tres@test.cl"]);
    });

    it("una lista vacía o nula sigue significando 'toda la cohorte'", async () => {
      const a = fakeAdmin(TODOS);
      expect(
        await getSessionRecipients(a.admin as never, { cohort_id: "c1", attendee_student_ids: [] }),
      ).toHaveLength(3);
      const b = fakeAdmin(TODOS);
      expect(
        await getSessionRecipients(b.admin as never, { cohort_id: "c1", attendee_student_ids: null }),
      ).toHaveLength(3);
    });

    it("no le escribe a alguien de la lista que ya no está matriculado", async () => {
      // El filtro de matrícula activa corre primero; la lista solo acota.
      const { admin } = fakeAdmin([alumno("stu-1", "uno@test.cl")]);
      const r = await getSessionRecipients(admin as never, {
        cohort_id: "c1",
        attendee_student_ids: ["stu-1", "stu-retirado"],
      });
      expect(r.map((x) => x.email)).toEqual(["uno@test.cl"]);
    });

    it("no reincorpora cuentas del equipo aunque estén en la lista", async () => {
      const { admin } = fakeAdmin([
        alumno("stu-1", "uno@test.cl"),
        alumno("stu-staff", "equipo@test.cl", "staff"),
      ]);
      const r = await getSessionRecipients(admin as never, {
        cohort_id: "c1",
        attendee_student_ids: ["stu-1", "stu-staff"],
      });
      expect(r.map((x) => x.email)).toEqual(["uno@test.cl"]);
    });
  });

  it("no manda dos correos a quien aparece dos veces", async () => {
    const { admin } = fakeAdmin([alumno("stu-1", "uno@test.cl"), alumno("stu-1b", "UNO@test.cl")]);
    const r = await getSessionRecipients(admin as never, { cohort_id: "c1" });
    expect(r).toHaveLength(1);
  });

  it("aplica el filtro de segmento en la consulta cuando la clase es de Capital Inteligente", async () => {
    const { admin, filtros } = fakeAdmin(TODOS);
    await getSessionRecipients(admin as never, {
      cohort_id: "c1",
      audience: "capital_inteligente",
    });
    expect(filtros).toContainEqual(["eq", "segment", "capital_inteligente"]);
  });
});
