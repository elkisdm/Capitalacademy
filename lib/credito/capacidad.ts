/**
 * Motor de capacidad de compra (ADR-0032).
 *
 * Responde la pregunta inversa a la de `calculo.ts`: en vez de "dado este valor
 * de propiedad, ¿cuál es el dividendo?", responde "dada esta situación
 * financiera, ¿hasta qué valor de propiedad se puede evaluar?".
 *
 * Funciones puras, sin I/O. El único dato externo es el valor de la UF, que
 * entra por parámetro.
 *
 * REGLA QUE GOBIERNA EL CRÉDITO: cuando hay varios topes, manda el MENOR.
 * Capacidad de pago y múltiplo de renta no son alternativas entre las que elegir
 * sino restricciones simultáneas, y el error barato es quedarse corto. Si esto
 * sobreestima, el asesor ilusiona al cliente en la reunión y el banco lo rechaza
 * semanas después — exactamente el daño que la metodología comercial que esta
 * herramienta apoya busca evitar.
 *
 * El AHORRO no es un tope (enmienda 2026-08-12 al ADR-0032): la capacidad la
 * define la renta. El pie es la parte del cliente y se informa como brecha
 * (`brechaPieCLP`), no colapsa el titular a cero.
 */

import { tasaMensual } from "./calculo";
import {
  CARGA_POR_TRAMO,
  FINANCIAMIENTO_POR_PERFIL,
  MULTIPLO_RENTA_MAX,
  UMBRAL_CARGA_ALTA_CLP,
  type ColorPerfil,
} from "./capacidad-constants";

/**
 * Proporción de la renta que puede comprometer el dividendo.
 *
 * OJO con el borde: el umbral es inclusivo hacia arriba. Una renta de exactamente
 * $2.500.000 ya usa la carga alta.
 */
export function cargaMaxima(rentaMensual: number): number {
  return rentaMensual >= UMBRAL_CARGA_ALTA_CLP
    ? CARGA_POR_TRAMO.alta
    : CARGA_POR_TRAMO.baja;
}

/** Dividendo mensual máximo que la renta soporta, en pesos. */
export function dividendoMaximo(rentaMensual: number): number {
  if (rentaMensual <= 0) return 0;
  return rentaMensual * cargaMaxima(rentaMensual);
}

/**
 * Capital que se puede pedir prestado con un dividendo dado: el valor presente
 * de una anualidad.
 *
 *                 1 − (1 + i)^−n
 *     C  =  D  ·  ──────────────
 *                       i
 *
 * Es exactamente el inverso de `dividendoMensual()` de `calculo.ts`. Ambas deben
 * cuadrar y hay un test de ida y vuelta que lo verifica: si alguien toca una,
 * ese test avisa que la otra quedó desalineada.
 */
export function creditoPorDividendo(params: {
  dividendoMensual: number;
  tasaAnual: number;
  plazoAnios: number;
}): number {
  const { dividendoMensual: D, tasaAnual, plazoAnios } = params;
  const n = Math.round(plazoAnios * 12);
  if (D <= 0 || n <= 0) return 0;

  const i = tasaMensual(tasaAnual);
  // Tasa 0: no hay interés, el capital es la cuota repetida n veces.
  if (i === 0) return D * n;

  return (D * (1 - Math.pow(1 + i, -n))) / i;
}

/**
 * Tope de crédito por múltiplo de renta, descontando el hipotecario vigente.
 *
 * El descuento es la razón por la que `deudaTotal` por fin entra a un cálculo:
 * hasta ahora el formulario la pedía y no la usaba (corrección #6 del ADR-0027,
 * registrada como deuda deliberada). Un cliente con un hipotecario a medio pagar
 * no puede pedir el máximo otra vez.
 */
export function creditoPorMultiploRenta(params: {
  rentaMensual: number;
  saldoHipotecarioVigente?: number;
}): number {
  const { rentaMensual, saldoHipotecarioVigente = 0 } = params;
  if (rentaMensual <= 0) return 0;

  const tope = rentaMensual * MULTIPLO_RENTA_MAX;
  return Math.max(0, tope - Math.max(0, saldoHipotecarioVigente));
}

export type CreditoMaximo = {
  /** El que manda: el menor de los dos topes. */
  monto: number;
  /** Cuál restringió, para poder explicarlo en pantalla. */
  limitadoPor: "capacidad_de_pago" | "multiplo_de_renta";
  porCapacidadDePago: number;
  porMultiploDeRenta: number;
};

/** Crédito máximo: el MENOR entre lo que la cuota permite y lo que la renta habilita. */
export function creditoMaximo(params: {
  rentaMensual: number;
  tasaAnual: number;
  plazoAnios: number;
  saldoHipotecarioVigente?: number;
}): CreditoMaximo {
  const { rentaMensual, tasaAnual, plazoAnios, saldoHipotecarioVigente } = params;

  const porCapacidadDePago = creditoPorDividendo({
    dividendoMensual: dividendoMaximo(rentaMensual),
    tasaAnual,
    plazoAnios,
  });
  const porMultiploDeRenta = creditoPorMultiploRenta({
    rentaMensual,
    saldoHipotecarioVigente,
  });

  const monto = Math.min(porCapacidadDePago, porMultiploDeRenta);

  return {
    monto,
    limitadoPor:
      porCapacidadDePago <= porMultiploDeRenta
        ? "capacidad_de_pago"
        : "multiplo_de_renta",
    porCapacidadDePago,
    porMultiploDeRenta,
  };
}

export type CapacidadDeCompra = {
  /** El dato que el asesor dice en voz alta. */
  valorMaximoPropiedadUF: number;
  /** Qué restringió el valor: es lo que vuelve accionable la recomendación. */
  limitadoPor: "capacidad_de_pago" | "multiplo_de_renta";
  creditoMaximoCLP: number;
  pieRequeridoCLP: number;
  /**
   * Lo que falta de ahorro para cubrir el pie de ese valor. 0 cuando el ahorro
   * declarado alcanza. Es información complementaria, no un tope: el titular
   * supone que el pie se completa.
   */
  brechaPieCLP: number;
  dividendoEstimadoCLP: number;
  financiamiento: number;
  plazoAnios: number;
};

/**
 * Valor máximo de propiedad que este perfil puede evaluar hoy.
 *
 * ENMIENDA 2026-08-12 al ADR-0032: la capacidad la define la RENTA (crédito
 * máximo / % de financiamiento), no el ahorro. El diseño original hacía del
 * ahorro un tercer tope y con ahorro $0 el titular colapsaba a 0 UF junto a un
 * perfil "viable" — contradictorio en reunión. Ahora el pie se informa como
 * brecha: cuánto exige este valor y cuánto falta de ahorro para cubrirlo.
 */
export function capacidadDeCompra(params: {
  rentaMensual: number;
  ahorroDisponibleCLP: number;
  tasaAnual: number;
  plazoAnios: number;
  perfil: ColorPerfil;
  valorUF: number;
  saldoHipotecarioVigente?: number;
}): CapacidadDeCompra {
  const {
    rentaMensual,
    ahorroDisponibleCLP,
    tasaAnual,
    plazoAnios,
    perfil,
    valorUF,
    saldoHipotecarioVigente,
  } = params;

  const financiamiento = FINANCIAMIENTO_POR_PERFIL[perfil];
  const credito = creditoMaximo({
    rentaMensual,
    tasaAnual,
    plazoAnios,
    saldoHipotecarioVigente,
  });

  const vacio: CapacidadDeCompra = {
    valorMaximoPropiedadUF: 0,
    limitadoPor: credito.limitadoPor,
    creditoMaximoCLP: 0,
    pieRequeridoCLP: 0,
    brechaPieCLP: 0,
    dividendoEstimadoCLP: 0,
    financiamiento,
    plazoAnios,
  };

  if (valorUF <= 0 || credito.monto <= 0) return vacio;

  // Hasta dónde alcanza el crédito, dado cuánto financia el banco. El resto del
  // valor es el pie, y ese pie se informa — no restringe.
  const valorCLP = credito.monto / financiamiento;
  const pieRequeridoCLP = valorCLP - credito.monto;
  const brechaPieCLP = Math.max(
    0,
    pieRequeridoCLP - Math.max(0, ahorroDisponibleCLP),
  );

  return {
    valorMaximoPropiedadUF: valorCLP / valorUF,
    limitadoPor: credito.limitadoPor,
    creditoMaximoCLP: credito.monto,
    pieRequeridoCLP,
    brechaPieCLP,
    dividendoEstimadoCLP: dividendoPorCredito({
      credito: credito.monto,
      tasaAnual,
      plazoAnios,
    }),
    financiamiento,
    plazoAnios,
  };
}

/**
 * Cuota mensual de un crédito. Es la anualidad francesa expresada en pesos, sin
 * pasar por UF ni por el pie — `calculo.dividendoMensual()` hace lo mismo pero
 * partiendo del valor de la propiedad, que acá ya no es el punto de entrada.
 */
export function dividendoPorCredito(params: {
  credito: number;
  tasaAnual: number;
  plazoAnios: number;
}): number {
  const { credito, tasaAnual, plazoAnios } = params;
  const n = Math.round(plazoAnios * 12);
  if (credito <= 0 || n <= 0) return 0;

  const i = tasaMensual(tasaAnual);
  if (i === 0) return credito / n;

  return (credito * i) / (1 - Math.pow(1 + i, -n));
}
