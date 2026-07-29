/**
 * Parámetros del simulador de crédito hipotecario.
 *
 * Portados desde la planilla "CALCULADORA CREDITO.xlsx" (hoja `DIVIDENDO RENTA 25%`),
 * donde vivían como celdas sueltas. Acá están nombrados y en un solo lugar para que
 * cambiar una política del banco sea una línea, no una cacería por la planilla.
 *
 * Fuente de cada valor: planilla de la clienta, 2026-07-29.
 */

/** Castigo aplicado a cada fuente de ingreso al reconocerla. 1 = se toma completa. */
export const CASTIGO_INGRESO = {
  /** Liquidaciones de sueldo: se toman completas (planilla `I6`). */
  sueldo: 1,
  /** Boletas de honorarios: 70% (planilla `I7`). */
  boletas: 0.7,
  /**
   * Arriendos: la planilla los toma al 100% (`I8 = B17`), a diferencia de boletas y
   * retiros. REVISAR CON LA CLIENTA: la mayoría de los bancos castiga la renta de
   * arriendo al 70-80%. Se mantiene en 1 para no rechazar clientes que hoy califican.
   */
  arriendo: 1,
  /** Retiros cód. 104 F22: 70% sobre el promedio mensual (planilla `I9`). */
  retiros: 0.7,
} as const;

/** Renta mínima exigida para calificar, en pesos (planilla `I11` y `G27`). */
export const RENTA_MINIMA_CLP = 1_400_000;

/**
 * Proporción máxima de la renta que puede comprometer el dividendo.
 * Es el corazón de la planilla: su tabla superior es `dividendo * 4`, o sea la renta
 * necesaria para que el dividendo sea el 25% de los ingresos.
 */
export const CARGA_MAXIMA = 0.25;

/** Boletas de honorarios exigidas para reconocer ese ingreso (planilla: 6 celdas). */
export const BOLETAS_MINIMAS = 3;

/** Tasa anual por defecto del crédito hipotecario (planilla `C32`). */
export const TASA_ANUAL_DEFAULT = 0.0332;

/** Pies ofrecidos como columnas de la matriz (planilla `C59:C62`). */
export const PIES = [0.07, 0.1, 0.15, 0.2] as const;

/** Plazos ofrecidos como filas de la matriz, en años (planilla `C53:C56`). */
export const PLAZOS_ANIOS = [15, 20, 25, 30] as const;

/**
 * Edad máxima al término del crédito (planilla, columna `L`: 79 años).
 * Determina el plazo máximo que se le puede ofrecer a una persona.
 */
export const EDAD_MAXIMA_TERMINO = 79;

/**
 * Valor UF de respaldo, usado solo si `mindicador.cl` no responde y no hay valor
 * cacheado. Es el que traía la planilla (`C35`).
 */
export const VALOR_UF_FALLBACK = 41_000;

export const DISCLAIMER =
  "Esto no es una simulación oficial y no reemplaza los criterios del banco. Es una " +
  "referencia: el dividendo máximo a adquirir queda sujeto a la política del banco en " +
  "el cual se realice la pre o aprobación bancaria.";

export const NOTA_SEGUROS =
  "El dividendo mostrado no incluye seguros de desgravamen ni de incendio, que el banco " +
  "suma aparte.";
