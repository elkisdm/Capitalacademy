/**
 * Parámetros del Motor de Evaluación Financiera (ADR-0032).
 *
 * DELIBERADAMENTE SEPARADO de `constants.ts`. Ese archivo gobierna la calculadora
 * pública, que está en producción captando leads y cuyos resultados calzan con la
 * planilla que la clienta valida. Esta herramienta usa reglas más nuevas —carga
 * escalonada, múltiplo de renta— y mezclarlas movería números ya publicados sin
 * que nadie lo pidiera.
 *
 * Si algún día ambas convergen, converger es un cambio explícito con su ADR, no
 * un efecto secundario de editar una constante compartida.
 *
 * Se REUSAN de `constants.ts` (son las mismas para las dos herramientas y no hay
 * motivo para duplicarlas): castigos por fuente, renta mínima, boletas mínimas,
 * tasa por defecto, plazos y edad máxima al término.
 */

/**
 * Renta desde la cual el banco acepta comprometer una proporción mayor.
 * Bajo este umbral la vida cuesta lo mismo pero queda menos margen, así que la
 * carga permitida es menor.
 */
export const UMBRAL_CARGA_ALTA_CLP = 2_500_000;

/** Proporción de la renta que puede comprometer el dividendo, por tramo. */
export const CARGA_POR_TRAMO = {
  /** Renta bajo `UMBRAL_CARGA_ALTA_CLP`. */
  baja: 0.25,
  /** Renta igual o superior al umbral. */
  alta: 0.3,
} as const;

/**
 * Tope de crédito como múltiplo de la renta reconocida.
 *
 * Es una restricción SIMULTÁNEA con la capacidad de pago, no una alternativa:
 * un cliente puede pagar la cuota y aun así exceder lo que el banco presta
 * contra su renta. Ver `creditoMaximo()`, que se queda con el menor.
 */
export const MULTIPLO_RENTA_MAX = 60;

/**
 * Porcentaje del valor de la propiedad que el banco financia, según el perfil.
 * El resto es el pie que el cliente debe tener ahorrado.
 */
export const FINANCIAMIENTO_POR_PERFIL = {
  verde: 0.9,
  amarillo: 0.8,
  rojo: 0.8,
} as const;

export type ColorPerfil = keyof typeof FINANCIAMIENTO_POR_PERFIL;

/**
 * Aviso que acompaña SIEMPRE al resultado, nunca en letra chica.
 *
 * Esta herramienta produce una cifra que el asesor le dice a un cliente real en
 * una reunión. Un "perfil favorable" se lee como una aprobación si nadie aclara
 * lo contrario, y el costo de esa confusión lo paga el cliente semanas después.
 */
export const DISCLAIMER_EVALUACION =
  "Esta es una estimación referencial para orientar la asesoría, no una " +
  "preaprobación bancaria. El monto final lo determina el banco según su propia " +
  "política de riesgo, que considera variables adicionales a las de esta ficha.";

/**
 * v1 no incluye seguros de desgravamen e incendio ni gastos operacionales
 * (~3% del valor en Chile, que además salen del pie). Se declara en pantalla en
 * vez de inventar una prima, igual que la calculadora pública.
 */
export const NOTA_COSTOS_NO_INCLUIDOS =
  "No se consideran seguros de desgravamen e incendio ni los gastos " +
  "operacionales de la compra (alrededor de un 3% del valor), que se pagan " +
  "aparte y salen del mismo ahorro destinado al pie.";
