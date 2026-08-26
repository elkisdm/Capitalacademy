import { describe, it, expect } from "vitest";
import {
  isInternalAccount,
  isRealStudent,
  onlyRealStudents,
} from "@/lib/profiles/account-type";

describe("isInternalAccount", () => {
  it("marca como internas las cuentas del equipo y de QA", () => {
    expect(isInternalAccount("staff")).toBe(true);
    expect(isInternalAccount("test")).toBe(true);
  });

  it("no marca como interna una cuenta real", () => {
    expect(isInternalAccount("real")).toBe(false);
  });

  it("trata un valor ausente como REAL, no como interno", () => {
    // Falla hacia "es alumno real" a propósito: el error inverso saca a una
    // persona de sus correos y de los reportes sin dejar rastro.
    expect(isInternalAccount(null)).toBe(false);
    expect(isInternalAccount(undefined)).toBe(false);
    expect(isInternalAccount("")).toBe(false);
  });

  it("no confunde un valor desconocido con interno", () => {
    expect(isInternalAccount("cualquier-cosa")).toBe(false);
  });
});

describe("isRealStudent", () => {
  it("acepta al alumno real y rechaza al interno", () => {
    expect(isRealStudent({ account_type: "real" })).toBe(true);
    expect(isRealStudent({ account_type: "staff" })).toBe(false);
    expect(isRealStudent({ account_type: "test" })).toBe(false);
  });

  it("no revienta con un perfil ausente", () => {
    expect(isRealStudent(null)).toBe(true);
    expect(isRealStudent(undefined)).toBe(true);
    expect(isRealStudent({})).toBe(true);
  });
});

describe("onlyRealStudents", () => {
  it("deja fuera las matrículas de cuentas internas", () => {
    const rows = [
      { student_id: "a", profiles: { account_type: "real" } },
      { student_id: "b", profiles: { account_type: "staff" } },
      { student_id: "c", profiles: { account_type: "test" } },
      { student_id: "d", profiles: { account_type: "real" } },
    ];
    const reales = onlyRealStudents(rows, (r) => r.profiles);
    expect(reales.map((r) => r.student_id)).toEqual(["a", "d"]);
  });

  it("conserva la fila cuando el perfil no vino en el select", () => {
    const rows = [{ student_id: "a", profiles: null }];
    expect(onlyRealStudents(rows, (r) => r.profiles)).toHaveLength(1);
  });

  it("devuelve una lista vacía sin romper", () => {
    expect(onlyRealStudents([], () => null)).toEqual([]);
  });
});
