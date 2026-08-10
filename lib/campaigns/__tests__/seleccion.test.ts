import { describe, it, expect } from "vitest";
import { seleccionEfectiva, audienceStudentIdsParaGuardar } from "@/lib/campaigns/seleccion";

const AUDIENCIA = ["a", "b", "c", "d"];

describe("seleccionEfectiva", () => {
  it("sin selección manual son todos los de la audiencia", () => {
    expect(seleccionEfectiva(AUDIENCIA, null)).toEqual(AUDIENCIA);
  });

  it("descarta a quien ya no está en la audiencia", () => {
    expect(seleccionEfectiva(AUDIENCIA, ["a", "x", "c"])).toEqual(["a", "c"]);
  });

  it("no revienta con audiencia vacía", () => {
    expect(seleccionEfectiva([], ["a"])).toEqual([]);
  });
});

describe("audienceStudentIdsParaGuardar", () => {
  // El bug que motivó extraer esto: guardar mientras la lista de destinatarios
  // todavía cargaba borraba la selección y el envío alcanzaba a la cohorte
  // entera. Con la audiencia desconocida NO se guarda nada.
  it("se niega a decidir si la audiencia no está resuelta", () => {
    const r = audienceStudentIdsParaGuardar([], ["a", "b"], false);

    expect(r).toEqual({ ok: false, reason: "audiencia-desconocida" });
  });

  it("una selección parcial se guarda tal cual", () => {
    const r = audienceStudentIdsParaGuardar(AUDIENCIA, ["a", "c"], true);

    expect(r).toEqual({ ok: true, value: ["a", "c"] });
  });

  // "Todos marcados" y "sin selección" se ven igual en pantalla, así que se
  // guardan igual: null. Si mañana entra alguien nuevo al filtro, lo recibe.
  it("marcar a todos equivale a no tener selección manual", () => {
    const r = audienceStudentIdsParaGuardar(AUDIENCIA, [...AUDIENCIA], true);

    expect(r).toEqual({ ok: true, value: null });
  });

  // El caso que rompía el invariante por la puerta de atrás: la selección tiene
  // tantos ids como personas hay en la audiencia, pero uno de ellos ya se retiró
  // y otro nunca fue elegido. Comparar tamaños sin filtrar daba "son todos".
  it("no confunde 'mismo tamaño' con 'son todos'", () => {
    const r = audienceStudentIdsParaGuardar(AUDIENCIA, ["a", "b", "x", "y"], true);

    expect(r).toEqual({ ok: true, value: ["a", "b"] });
  });

  it("avisa en vez de guardar cuando no queda nadie seleccionado", () => {
    const r = audienceStudentIdsParaGuardar(AUDIENCIA, ["x", "y"], true);

    expect(r).toEqual({ ok: false, reason: "nadie" });
  });

  it("sin selección manual guarda null", () => {
    expect(audienceStudentIdsParaGuardar(AUDIENCIA, null, true)).toEqual({
      ok: true,
      value: null,
    });
  });

  it("con audiencia vacía de verdad no inventa una selección", () => {
    expect(audienceStudentIdsParaGuardar([], null, true)).toEqual({ ok: true, value: null });
    expect(audienceStudentIdsParaGuardar([], ["a"], true)).toEqual({ ok: true, value: null });
  });
});
