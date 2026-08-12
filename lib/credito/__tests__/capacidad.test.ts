import { describe, it, expect } from "vitest";
import {
  cargaMaxima,
  creditoMaximo,
  creditoPorDividendo,
  creditoPorMultiploRenta,
  capacidadDeCompra,
  dividendoMaximo,
  dividendoPorCredito,
} from "@/lib/credito/capacidad";
import { dividendoMensual, plazoMaximoPorEdad } from "@/lib/credito/calculo";
import { CARGA_MAXIMA, TASA_ANUAL_DEFAULT } from "@/lib/credito/constants";
import { CARGA_POR_TRAMO, UMBRAL_CARGA_ALTA_CLP } from "@/lib/credito/capacidad-constants";

const TASA = TASA_ANUAL_DEFAULT;
const UF = 39_000;

describe("cargaMaxima — la regla escalonada (E2)", () => {
  // El borde exacto importa: es la diferencia entre $625.000 y $750.000 de
  // dividendo tope para alguien que gana justo $2.500.000.
  it("bajo el umbral usa la carga baja", () => {
    expect(cargaMaxima(UMBRAL_CARGA_ALTA_CLP - 1)).toBe(CARGA_POR_TRAMO.baja);
  });

  it("el umbral exacto YA usa la carga alta", () => {
    expect(cargaMaxima(UMBRAL_CARGA_ALTA_CLP)).toBe(CARGA_POR_TRAMO.alta);
  });

  it("sobre el umbral usa la carga alta", () => {
    expect(cargaMaxima(3_000_000)).toBe(CARGA_POR_TRAMO.alta);
  });

  it("el dividendo máximo aplica el tramo que corresponde", () => {
    expect(dividendoMaximo(2_000_000)).toBe(500_000);
    expect(dividendoMaximo(2_500_000)).toBe(750_000);
  });

  it("una renta cero o negativa no da dividendo", () => {
    expect(dividendoMaximo(0)).toBe(0);
    expect(dividendoMaximo(-100)).toBe(0);
  });
});

describe("creditoPorDividendo — el despeje inverso", () => {
  it("a mayor plazo, mayor crédito con el mismo dividendo", () => {
    const a15 = creditoPorDividendo({ dividendoMensual: 500_000, tasaAnual: TASA, plazoAnios: 15 });
    const a30 = creditoPorDividendo({ dividendoMensual: 500_000, tasaAnual: TASA, plazoAnios: 30 });

    expect(a30).toBeGreaterThan(a15);
  });

  it("con tasa 0 el crédito es la cuota repetida n veces", () => {
    const c = creditoPorDividendo({ dividendoMensual: 100_000, tasaAnual: 0, plazoAnios: 10 });
    expect(c).toBeCloseTo(100_000 * 120, 6);
  });

  it("sin dividendo o sin plazo no hay crédito", () => {
    expect(creditoPorDividendo({ dividendoMensual: 0, tasaAnual: TASA, plazoAnios: 20 })).toBe(0);
    expect(creditoPorDividendo({ dividendoMensual: 500_000, tasaAnual: TASA, plazoAnios: 0 })).toBe(0);
  });
});

// E7 — La garantía de que las dos direcciones del motor no se desalineen.
describe("ida y vuelta contra calculo.ts (E7)", () => {
  it("el crédito despejado, devuelto a dividendo, da el mismo dividendo", () => {
    const D = 620_000;
    const plazoAnios = 25;

    const credito = creditoPorDividendo({ dividendoMensual: D, tasaAnual: TASA, plazoAnios });
    const vuelta = dividendoPorCredito({ credito, tasaAnual: TASA, plazoAnios });

    expect(vuelta).toBeCloseTo(D, 2);
  });

  // El mismo viaje pasando por la fórmula que usa la calculadora pública, que
  // entra por valor de propiedad y pie en vez de por capital.
  it("cuadra con dividendoMensual() de la calculadora pública", () => {
    const D = 700_000;
    const plazoAnios = 20;
    const financiamiento = 0.8;

    const credito = creditoPorDividendo({ dividendoMensual: D, tasaAnual: TASA, plazoAnios });
    const valorPropiedadUF = credito / financiamiento / UF;

    const vuelta = dividendoMensual({
      valorPropiedadUF,
      pie: 1 - financiamiento,
      tasaAnual: TASA,
      plazoAnios,
      valorUF: UF,
    });

    expect(vuelta).toBeCloseTo(D, 2);
  });
});

describe("creditoPorMultiploRenta — descuenta el hipotecario vigente (E4)", () => {
  it("sin deuda hipotecaria es 60 veces la renta", () => {
    expect(creditoPorMultiploRenta({ rentaMensual: 3_000_000 })).toBe(180_000_000);
  });

  it("el saldo hipotecario vigente se descuenta", () => {
    const tope = creditoPorMultiploRenta({
      rentaMensual: 3_000_000,
      saldoHipotecarioVigente: 40_000_000,
    });

    expect(tope).toBe(140_000_000);
  });

  it("una deuda mayor al tope deja el crédito en cero, no en negativo", () => {
    const tope = creditoPorMultiploRenta({
      rentaMensual: 1_000_000,
      saldoHipotecarioVigente: 90_000_000,
    });

    expect(tope).toBe(0);
  });
});

describe("creditoMaximo — manda el menor (E3/D3)", () => {
  // Con plazos largos la capacidad de pago suele superar el múltiplo de renta:
  // ahí el múltiplo es el que restringe, y hay que decirlo.
  it("cuando el múltiplo de renta es menor, ese limita", () => {
    const r = creditoMaximo({ rentaMensual: 3_000_000, tasaAnual: TASA, plazoAnios: 30 });

    expect(r.monto).toBe(Math.min(r.porCapacidadDePago, r.porMultiploDeRenta));
    expect(r.limitadoPor).toBe("multiplo_de_renta");
  });

  it("con plazo corto manda la capacidad de pago", () => {
    const r = creditoMaximo({ rentaMensual: 3_000_000, tasaAnual: TASA, plazoAnios: 15 });

    expect(r.limitadoPor).toBe("capacidad_de_pago");
    expect(r.monto).toBe(r.porCapacidadDePago);
  });

  it("un hipotecario vigente grande puede volver al múltiplo el limitante", () => {
    const sin = creditoMaximo({ rentaMensual: 2_000_000, tasaAnual: TASA, plazoAnios: 15 });
    const con = creditoMaximo({
      rentaMensual: 2_000_000,
      tasaAnual: TASA,
      plazoAnios: 15,
      saldoHipotecarioVigente: 100_000_000,
    });

    expect(con.monto).toBeLessThan(sin.monto);
    expect(con.limitadoPor).toBe("multiplo_de_renta");
  });
});

describe("capacidadDeCompra — el dato que el asesor dice en voz alta (E1)", () => {
  const CASO = {
    rentaMensual: 2_800_000,
    ahorroDisponibleCLP: 35_100_000, // 900 UF
    tasaAnual: TASA,
    plazoAnios: 25,
    perfil: "verde" as const,
    valorUF: UF,
  };

  it("entrega un tope en UF junto al pie y el dividendo asociado", () => {
    const r = capacidadDeCompra(CASO);

    expect(r.valorMaximoPropiedadUF).toBeGreaterThan(0);
    expect(r.pieRequeridoCLP).toBeGreaterThan(0);
    expect(r.dividendoEstimadoCLP).toBeGreaterThan(0);
    expect(r.financiamiento).toBe(0.9);
  });

  // Coherencia interna: las cifras que se muestran juntas tienen que cuadrar
  // entre sí, o el asesor pierde credibilidad frente al cliente en la reunión.
  it("el pie y el crédito suman el valor de la propiedad", () => {
    const r = capacidadDeCompra(CASO);
    const valorCLP = r.valorMaximoPropiedadUF * UF;

    expect(r.creditoMaximoCLP + r.pieRequeridoCLP).toBeCloseTo(valorCLP, 2);
  });

  it("el dividendo mostrado nunca supera la carga máxima de la renta", () => {
    const r = capacidadDeCompra(CASO);

    expect(r.dividendoEstimadoCLP).toBeLessThanOrEqual(dividendoMaximo(CASO.rentaMensual) + 1);
  });

  // E3 (enmienda 2026-08-12): el ahorro NO limita el titular — la capacidad la
  // define la renta. El pie se informa como brecha.
  it("con poco ahorro el valor no cambia y la brecha dice cuánto falta", () => {
    const conAhorro = capacidadDeCompra(CASO);
    const pocoAhorro = capacidadDeCompra({ ...CASO, ahorroDisponibleCLP: 7_800_000 }); // 200 UF

    expect(pocoAhorro.valorMaximoPropiedadUF).toBeCloseTo(
      conAhorro.valorMaximoPropiedadUF,
      6,
    );
    expect(pocoAhorro.brechaPieCLP).toBeCloseTo(
      pocoAhorro.pieRequeridoCLP - 7_800_000,
      2,
    );
  });

  it("si el ahorro cubre el pie, la brecha es cero", () => {
    const r = capacidadDeCompra({ ...CASO, ahorroDisponibleCLP: 500_000_000 });

    expect(r.brechaPieCLP).toBe(0);
  });

  // Un perfil amarillo financia menos, así que exige más pie para el mismo crédito.
  it("un perfil más restringido exige más pie", () => {
    const verde = capacidadDeCompra(CASO);
    const amarillo = capacidadDeCompra({ ...CASO, perfil: "amarillo" });

    expect(amarillo.financiamiento).toBeLessThan(verde.financiamiento);
    expect(amarillo.pieRequeridoCLP).toBeGreaterThan(verde.pieRequeridoCLP);
  });

  // E5 — la edad manda sobre el plazo, y el plazo sobre el tope.
  it("un plazo más corto por edad baja el tope, sin error", () => {
    const plazo62 = plazoMaximoPorEdad(62);
    expect(plazo62).toBe(15);

    const mayor = capacidadDeCompra({
      ...CASO,
      plazoAnios: plazo62 as number,
      ahorroDisponibleCLP: 500_000_000,
    });
    const joven = capacidadDeCompra({
      ...CASO,
      plazoAnios: 30,
      ahorroDisponibleCLP: 500_000_000,
    });

    expect(mayor.valorMaximoPropiedadUF).toBeLessThan(joven.valorMaximoPropiedadUF);
    expect(mayor.valorMaximoPropiedadUF).toBeGreaterThan(0);
  });

  it("sin renta no hay capacidad y no revienta", () => {
    const r = capacidadDeCompra({ ...CASO, rentaMensual: 0 });

    expect(r.valorMaximoPropiedadUF).toBe(0);
    expect(r.creditoMaximoCLP).toBe(0);
  });

  // El caso que motivó la enmienda: ahorro $0 dejaba el titular en 0 UF junto a
  // un perfil "viable".
  it("sin ahorro el titular no colapsa: la brecha es el pie completo", () => {
    const r = capacidadDeCompra({ ...CASO, ahorroDisponibleCLP: 0 });

    expect(r.valorMaximoPropiedadUF).toBeGreaterThan(0);
    expect(r.brechaPieCLP).toBeCloseTo(r.pieRequeridoCLP, 2);
  });

  it("un valor UF inválido no produce cifras absurdas", () => {
    const r = capacidadDeCompra({ ...CASO, valorUF: 0 });

    expect(r.valorMaximoPropiedadUF).toBe(0);
  });
});

// E8 — la calculadora pública no se movió (D2).
describe("la calculadora pública conserva su carga fija (E8)", () => {
  it("CARGA_MAXIMA sigue siendo 25%, sin escalonar", () => {
    expect(CARGA_MAXIMA).toBe(0.25);
  });

  it("la regla escalonada es distinta de la fija sobre el umbral", () => {
    expect(cargaMaxima(3_000_000)).not.toBe(CARGA_MAXIMA);
    expect(cargaMaxima(1_800_000)).toBe(CARGA_MAXIMA);
  });
});
