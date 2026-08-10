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
 * REGLA QUE GOBIERNA TODO EL ARCHIVO: cuando hay varios topes, manda el MENOR.
 * No son alternativas entre las que elegir sino restricciones simultáneas, y el
 * error barato es quedarse corto. Si esto sobreestima, el asesor ilusiona al
 * cliente en la reunión y el banco lo rechaza semanas después — exactamente el
 * daño que la metodología comercial que esta herramienta apoya busca evitar.
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
  limitadoPor: "capacidad_de_pago" | "multiplo_de_renta" | "ahorro_disponible";
  creditoMaximoCLP: number;
  pieRequeridoCLP: number;
  dividendoEstimadoCLP: number;
  financiamiento: number;
  plazoAnios: number;
  /** Detalle de los tres topes, en UF, para poder explicar el resultado. */
  topesUF: {
    porCredito: number;
    porAhorro: number;
  };
};

/**
 * Valor máximo de propiedad que este perfil puede evaluar hoy.
 *
 * El tope por AHORRO no es decorativo y es la corrección más importante al
 * planteamiento original: de nada sirve calificar para un crédito de 4.000 UF si
 * el cliente tiene 200 UF ahorradas y el pie exigido son 400. En la práctica el
 * pie manda más seguido que el crédito, y además es lo único que le da sentido
 * numérico a la recomendación "aumentar el pie" — sin este tope, esa palanca no
 * movería ninguna cifra.
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
    dividendoEstimadoCLP: 0,
    financiamiento,
    plazoAnios,
    topesUF: { porCredito: 0, porAhorro: 0 },
  };

  if (valorUF <= 0 || credito.monto <= 0) return vacio;

  // Tope 1: hasta dónde alcanza el crédito, dado cuánto financia el banco.
  const porCreditoCLP = credito.monto / financiamiento;
  // Tope 2: hasta dónde alcanza el ahorro para cubrir el pie.
  const pieProporcion = 1 - financiamiento;
  const porAhorroCLP =
    pieProporcion <= 0
      ? Number.POSITIVE_INFINITY // financiamiento 100%: el ahorro no restringe
      : Math.max(0, ahorroDisponibleCLP) / pieProporcion;

  const valorCLP = Math.min(porCreditoCLP, porAhorroCLP);

  const limitadoPor =
    porAhorroCLP < porCreditoCLP ? "ahorro_disponible" : credito.limitadoPor;

  // El crédito EFECTIVO puede ser menor que el máximo: si manda el ahorro, no se
  // pide todo lo que el banco daría. Presentar el máximo teórico junto a un valor
  // de propiedad menor sería incoherente.
  const creditoEfectivo = valorCLP * financiamiento;

  return {
    valorMaximoPropiedadUF: valorCLP / valorUF,
    limitadoPor,
    creditoMaximoCLP: creditoEfectivo,
    pieRequeridoCLP: valorCLP * pieProporcion,
    dividendoEstimadoCLP: dividendoPorCredito({
      credito: creditoEfectivo,
      tasaAnual,
      plazoAnios,
    }),
    financiamiento,
    plazoAnios,
    topesUF: {
      porCredito: porCreditoCLP / valorUF,
      porAhorro: Number.isFinite(porAhorroCLP) ? porAhorroCLP / valorUF : Infinity,
    },
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
