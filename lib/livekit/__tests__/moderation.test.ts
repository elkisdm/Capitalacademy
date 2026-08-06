import { describe, it, expect } from "vitest";
import {
  etiquetaSilenciar,
  confirmacionSacar,
  resultadoModeracion,
  ordenarParaModerar,
  type ParticipanteModerable,
} from "../moderation";

function p(
  name: string,
  micAbierto = false,
  identity = name.toLowerCase(),
): ParticipanteModerable {
  return { identity, name, micAbierto };
}

describe("etiquetaSilenciar", () => {
  it("ofrece silenciar solo a quien tiene el micrófono abierto", () => {
    expect(etiquetaSilenciar(true)).toBe("Silenciar");
    expect(etiquetaSilenciar(false)).toMatch(/ya está en silencio/i);
  });
});

describe("confirmacionSacar", () => {
  it("nombra a la persona, que es lo que evita el clic en la fila equivocada", () => {
    expect(confirmacionSacar("Ana Pérez")).toContain("Ana Pérez");
  });

  it("aclara que puede volver a entrar: no es una expulsión definitiva", () => {
    expect(confirmacionSacar("Ana")).toMatch(/volver a entrar/i);
  });
});

describe("resultadoModeracion", () => {
  it("confirma en pasado lo que ocurrió", () => {
    expect(resultadoModeracion("mute", "Ana", true)).toBe("Silenciaste a Ana.");
    expect(resultadoModeracion("remove", "Ana", true)).toBe("Sacaste a Ana de la clase.");
  });

  it("ante fallo lo dice sin culpar a quien lo pulsó", () => {
    expect(resultadoModeracion("mute", "Ana", false)).toMatch(/no se pudo/i);
  });
});

describe("ordenarParaModerar", () => {
  it("pone primero a quien tiene el micrófono abierto", () => {
    // Si el docente abre el panel es casi siempre porque alguien está sonando.
    const lista = [p("Ana"), p("Bruno", true), p("Carla")];
    expect(ordenarParaModerar(lista).map((x) => x.name)).toEqual(["Bruno", "Ana", "Carla"]);
  });

  it("a igualdad ordena alfabético, para que la lista no baile", () => {
    const lista = [p("Carla"), p("Ana"), p("Bruno")];
    expect(ordenarParaModerar(lista).map((x) => x.name)).toEqual(["Ana", "Bruno", "Carla"]);
  });

  it("ordena con criterio del español (acentos y ñ)", () => {
    const lista = [p("Ñandú"), p("Ana"), p("Ángel")];
    expect(ordenarParaModerar(lista).map((x) => x.name)).toEqual(["Ana", "Ángel", "Ñandú"]);
  });

  it("no muta la lista que recibe", () => {
    const lista = [p("Carla"), p("Ana", true)];
    const copia = [...lista];
    ordenarParaModerar(lista);
    expect(lista).toEqual(copia);
  });

  it("tolera una lista vacía", () => {
    expect(ordenarParaModerar([])).toEqual([]);
  });
});
