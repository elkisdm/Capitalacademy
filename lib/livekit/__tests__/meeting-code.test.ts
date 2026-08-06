import { describe, it, expect } from "vitest";
import { isMeetingCode, isUuid, parseSessionRef, meetingPath } from "../meeting-code";

/**
 * Lo que decide con qué columna se busca la sesión. Si `parseSessionRef` se
 * equivoca, la clase "no existe" — un 404 en la cara del alumno justo cuando la
 * clase está por empezar.
 */

const CODIGO = "xkw-mqtd-abn";
const UUID = "ffffffff-0000-0000-0000-0000000000aa";

describe("isMeetingCode", () => {
  it("reconoce el formato 3-4-3 en minúsculas", () => {
    expect(isMeetingCode(CODIGO)).toBe(true);
  });

  it("acepta mayúsculas y espacios de un copiar/pegar", () => {
    expect(isMeetingCode("  XKW-MQTD-ABN  ")).toBe(true);
  });

  it("rechaza otros largos de bloque", () => {
    expect(isMeetingCode("xk-mqtd-abn")).toBe(false);
    expect(isMeetingCode("xkw-mqt-abn")).toBe(false);
    expect(isMeetingCode("xkw-mqtd-abnn")).toBe(false);
  });

  it("rechaza dígitos: el código es solo letras a propósito", () => {
    // Sin dígitos no hay forma de confundir 0 con O ni 1 con l.
    expect(isMeetingCode("xk0-mqtd-abn")).toBe(false);
  });

  it("rechaza separadores que no sean guion", () => {
    expect(isMeetingCode("xkw mqtd abn")).toBe(false);
    expect(isMeetingCode("xkw_mqtd_abn")).toBe(false);
  });
});

describe("isUuid", () => {
  it("reconoce un UUID", () => {
    expect(isUuid(UUID)).toBe(true);
  });

  it("no confunde un código con un UUID", () => {
    expect(isUuid(CODIGO)).toBe(false);
  });
});

describe("parseSessionRef", () => {
  it("interpreta el código y lo normaliza a minúsculas", () => {
    expect(parseSessionRef("XKW-MQTD-ABN")).toEqual({ kind: "code", value: CODIGO });
  });

  it("interpreta el UUID, que es lo que llevan los correos ya enviados", () => {
    // Romper esos enlaces sería cambiarle el problema de lugar al alumno.
    expect(parseSessionRef(UUID)).toEqual({ kind: "id", value: UUID });
  });

  it("marca como inválido lo que no es ninguno de los dos", () => {
    // Importa que sea `invalid` y no que se pase a la consulta: buscar basura en
    // una columna uuid es un error de Postgres, no un 404 limpio.
    expect(parseSessionRef("../../etc/passwd").kind).toBe("invalid");
    expect(parseSessionRef("' or 1=1 --").kind).toBe("invalid");
    expect(parseSessionRef("").kind).toBe("invalid");
    expect(parseSessionRef(null).kind).toBe("invalid");
    expect(parseSessionRef(undefined).kind).toBe("invalid");
  });
});

describe("meetingPath", () => {
  it("arma la ruta de la sala con el código", () => {
    expect(meetingPath(CODIGO)).toBe("/sala/xkw-mqtd-abn");
  });
});
