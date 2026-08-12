import { describe, it, expect } from "vitest";
import {
  etiquetaSilenciar,
  confirmacionSacar,
  confirmacionSilenciarATodos,
  confirmacionTerminarClase,
  resultadoModeracion,
  resultadoMasivo,
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

describe("confirmacionSilenciarATodos", () => {
  it("dice a cuántas personas afecta: no es lo mismo cortar a tres que a la clase entera", () => {
    expect(confirmacionSilenciarATodos(12)).toContain("12");
  });

  it("concuerda en singular cuando queda una sola persona", () => {
    expect(confirmacionSilenciarATodos(1)).toMatch(/única persona/i);
    expect(confirmacionSilenciarATodos(1)).not.toMatch(/1 personas/);
  });

  it("aclara que es reversible: silenciar no es quitar la palabra", () => {
    expect(confirmacionSilenciarATodos(5)).toMatch(/volver a abrir su micrófono/i);
  });
});

describe("confirmacionTerminarClase", () => {
  it("nombra la consecuencia completa antes de que el clic la provoque", () => {
    const texto = confirmacionTerminarClase(8);
    expect(texto).toMatch(/desconectará/i);
    expect(texto).toContain("8 personas");
  });

  it("concuerda en singular", () => {
    expect(confirmacionTerminarClase(1)).toContain("1 persona");
    expect(confirmacionTerminarClase(1)).not.toContain("1 personas");
  });
});

describe("resultadoMasivo", () => {
  it("cuenta a cuántos silenció, que es lo que el docente no puede ver de un vistazo", () => {
    expect(resultadoMasivo("mute_all", true, 7)).toBe("Silenciaste a 7 personas.");
    expect(resultadoMasivo("mute_all", true, 1)).toBe("Silenciaste a 1 persona.");
  });

  it("cero silenciados NO es un fallo: es que nadie tenía el micrófono abierto", () => {
    // Si esto dijera "no se pudo", el docente volvería a pulsar creyendo que el
    // botón está roto.
    expect(resultadoMasivo("mute_all", true, 0)).toMatch(/nadie tenía el micrófono abierto/i);
  });

  it("confirma en pasado que la clase terminó para todos", () => {
    expect(resultadoMasivo("end_room", true)).toBe("Terminaste la clase para todos.");
  });

  it("ante fallo distingue cuál de las dos acciones falló", () => {
    expect(resultadoMasivo("mute_all", false)).toMatch(/no se pudo silenciar/i);
    expect(resultadoMasivo("end_room", false)).toMatch(/no se pudo terminar/i);
  });
});
