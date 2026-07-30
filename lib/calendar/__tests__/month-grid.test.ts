import { describe, it, expect } from "vitest";
import {
  buildMonthCells,
  dayKeyOf,
  groupByDay,
  toWeeks,
} from "@/lib/calendar/month-grid";

type S = { id: string; starts_at: string };

const s = (id: string, starts_at: string): S => ({ id, starts_at });

/**
 * Sesiones reales de producción al 2026-07-29 (hora UTC en la BD):
 * el sábado 1-ago tiene dos clases del Diplomado, y son las que desaparecían
 * de la vista de julio.
 */
const PROD = [
  s("obj", "2026-07-29T23:00:00+00:00"), // mié 29-jul 19:00 Chile
  s("ugc", "2026-07-28T14:00:00+00:00"), // mar 28-jul 10:00 Chile (Ciclo CI)
  s("proy", "2026-08-01T13:30:00+00:00"), // sáb 1-ago 09:30 Chile
  s("chall", "2026-08-01T18:30:00+00:00"), // sáb 1-ago 14:30 Chile
];

describe("dayKeyOf", () => {
  it("resuelve el día en hora de Chile, no en UTC", () => {
    // 23:00 UTC del 29-jul es 19:00 del 29-jul en Chile (UTC-4): mismo día.
    expect(dayKeyOf("2026-07-29T23:00:00+00:00")).toBe("2026-07-29");
  });

  it("no adelanta el día en el borde de medianoche de Chile", () => {
    // 02:00 UTC del 1-ago es 22:00 del 31-jul en Chile → pertenece a JULIO.
    expect(dayKeyOf("2026-08-01T02:00:00+00:00")).toBe("2026-07-31");
    // 03:59 UTC del 1-ago sigue siendo 31-jul en Chile.
    expect(dayKeyOf("2026-08-01T03:59:00+00:00")).toBe("2026-07-31");
    // 04:00 UTC ya es 00:00 del 1-ago en Chile.
    expect(dayKeyOf("2026-08-01T04:00:00+00:00")).toBe("2026-08-01");
  });
});

describe("groupByDay", () => {
  it("agrupa por día y ordena cada día por hora de inicio", () => {
    const m = groupByDay(PROD);
    expect(m.get("2026-08-01")!.map((x) => x.id)).toEqual(["proy", "chall"]);
    expect(m.get("2026-07-29")!.map((x) => x.id)).toEqual(["obj"]);
  });

  it("no crea entradas para días sin sesiones", () => {
    expect(groupByDay(PROD).has("2026-07-30")).toBe(false);
  });
});

describe("buildMonthCells — celdas de relleno", () => {
  it("REGRESIÓN: la vista de julio muestra las clases del 1 de agosto", () => {
    // Este es el bug reportado en la reunión del 29-jul: el sábado 1-ago cae en
    // la última semana de la grilla de julio, y sus dos clases no se veían.
    const julio = buildMonthCells(2026, 6, PROD); // month 6 = julio
    const agosto1 = julio.find((c) => c.key === "2026-08-01");

    expect(agosto1).toBeDefined();
    expect(agosto1!.inMonth).toBe(false); // sigue marcada como mes vecino…
    expect(agosto1!.sessions.map((x) => x.id)).toEqual(["proy", "chall"]); // …pero con sus clases
  });

  it("REGRESIÓN: la vista de agosto muestra las clases de fines de julio", () => {
    // Agosto 2026 empieza sábado → arrastra 5 días de julio como relleno.
    const agosto = buildMonthCells(2026, 7, PROD);
    const jul29 = agosto.find((c) => c.key === "2026-07-29");
    const jul28 = agosto.find((c) => c.key === "2026-07-28");

    expect(jul29?.inMonth).toBe(false);
    expect(jul29?.sessions.map((x) => x.id)).toEqual(["obj"]);
    expect(jul28?.sessions.map((x) => x.id)).toEqual(["ugc"]);
  });

  it("los días del propio mes conservan sus sesiones", () => {
    const julio = buildMonthCells(2026, 6, PROD);
    const jul29 = julio.find((c) => c.key === "2026-07-29");
    expect(jul29?.inMonth).toBe(true);
    expect(jul29?.sessions.map((x) => x.id)).toEqual(["obj"]);
  });

  it("un mismo día aparece con las mismas sesiones en las dos vistas", () => {
    // El invariante que se rompía: la grilla decía "vacío" y el panel de detalle
    // (que filtra sobre la lista completa) decía "2 clases".
    const desdeJulio = buildMonthCells(2026, 6, PROD).find((c) => c.key === "2026-08-01");
    const desdeAgosto = buildMonthCells(2026, 7, PROD).find((c) => c.key === "2026-08-01");
    expect(desdeJulio!.sessions).toEqual(desdeAgosto!.sessions);
  });
});

describe("buildMonthCells — estructura de la grilla", () => {
  it("siempre devuelve semanas completas", () => {
    for (let mes = 0; mes < 12; mes++) {
      const cells = buildMonthCells(2026, mes, []);
      expect(cells.length % 7).toBe(0);
    }
  });

  it("la primera celda es lunes y arranca con el relleno correcto", () => {
    // 1-jul-2026 es miércoles → la semana arranca el lunes 29-jun.
    const julio = buildMonthCells(2026, 6, []);
    expect(julio[0]!.key).toBe("2026-06-29");
    expect(julio[0]!.inMonth).toBe(false);
    expect(julio[2]!.key).toBe("2026-07-01");
    expect(julio[2]!.inMonth).toBe(true);
  });

  it("agosto 2026 empieza sábado y arrastra 5 días de julio", () => {
    const agosto = buildMonthCells(2026, 7, []);
    const relleno = agosto.filter((c) => !c.inMonth && c.key.startsWith("2026-07"));
    expect(relleno.map((c) => c.key)).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
    ]);
  });

  it("contiene todos los días del mes exactamente una vez", () => {
    const cells = buildMonthCells(2026, 7, []);
    const delMes = cells.filter((c) => c.inMonth);
    expect(delMes).toHaveLength(31);
    expect(new Set(delMes.map((c) => c.key)).size).toBe(31);
  });

  it("cruza el año en diciembre y enero", () => {
    const dic = buildMonthCells(2026, 11, []);
    expect(dic.some((c) => c.key.startsWith("2027-01"))).toBe(true);
    const ene = buildMonthCells(2026, 0, []);
    expect(ene.some((c) => c.key.startsWith("2025-12"))).toBe(true);
  });

  it("resuelve febrero de un año bisiesto", () => {
    const feb = buildMonthCells(2028, 1, []);
    expect(feb.filter((c) => c.inMonth)).toHaveLength(29);
  });
});

describe("toWeeks", () => {
  it("parte en filas de 7 sin perder celdas", () => {
    const cells = buildMonthCells(2026, 7, PROD);
    const weeks = toWeeks(cells);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat()).toHaveLength(cells.length);
  });
});
