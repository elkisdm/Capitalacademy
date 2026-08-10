/**
 * Umbrales del semáforo de perfil crediticio (ADR-0032).
 *
 * Todos juntos y nombrados a propósito: son política del banco, no matemática.
 * Cuando la clienta ajuste un criterio —y lo va a hacer, porque el ADR ya
 * contempla sumar profesión, tipo de contrato y primera/segunda vivienda— tiene
 * que ser una línea acá y no una cacería por el código.
 */

/** De dónde viene la renta principal del cliente. */
export type FuenteRenta =
  | "sueldo_indefinido"
  | "sueldo_plazo_fijo"
  | "mixto"
  | "honorarios";

export type EstadoEje = "verde" | "amarillo" | "rojo";

/** Cómo pesa cada fuente de renta en la estabilidad percibida. */
export const ESTABILIDAD_POR_FUENTE: Record<FuenteRenta, EstadoEje> = {
  sueldo_indefinido: "verde",
  sueldo_plazo_fijo: "amarillo",
  mixto: "amarillo",
  honorarios: "rojo",
};

/** Antigüedad laboral, en meses. */
export const ANTIGUEDAD = {
  /** Desde acá el banco no hace preguntas. */
  verdeMeses: 24,
  /** Bajo esto la antigüedad es un punto en contra. */
  amarilloMeses: 12,
} as const;

/**
 * Proporción del ingreso comprometida en cuotas vigentes.
 * Es el eje que el banco mira primero y el único que puede tumbar una operación
 * por sí solo — por eso además bloquea el verde global (ver `perfilCrediticio`).
 */
export const CARGA_FINANCIERA = {
  /** Bajo esta proporción, sin observaciones. */
  verdeMax: 0.15,
  /** Hasta acá es manejable; sobre esto es rojo. */
  amarilloMax: 0.3,
} as const;

/**
 * Patrimonio neto mínimo para verde, como proporción del valor de referencia.
 * No es un requisito bancario duro: es respaldo, y respalda mejor quien tiene
 * algo equivalente a un quinto de la operación.
 */
export const PATRIMONIO_MINIMO_SOBRE_VALOR = 0.2;

/**
 * Financiamiento usado SOLO para derivar un valor de propiedad de referencia a
 * partir del crédito base, al medir patrimonio.
 *
 * Es el escenario conservador (80%) y no el del perfil, justamente para no
 * introducir la circularidad que la decisión 5 del ADR-0032 evita: el perfil no
 * puede depender de un financiamiento que a su vez depende del perfil.
 */
export const VALOR_REFERENCIA_FINANCIAMIENTO = 0.8;

/**
 * Pie exigido por cada escenario de financiamiento, expresado como proporción
 * del crédito base (no del valor de la propiedad).
 *
 * Con financiamiento del 80%: valor = crédito/0,8 y pie = valor×0,2 = crédito×0,25.
 * Con financiamiento del 90%: valor = crédito/0,9 y pie = valor×0,1 = crédito×0,111…
 *
 * Cubrir el pie del escenario BAJO (el de 80%, que exige más plata propia) es lo
 * difícil, y por eso es lo que da verde.
 */
export const PIE_PROPORCION_ESCENARIO_BAJO = 0.25;
export const PIE_PROPORCION_ESCENARIO_ALTO = 1 / 9;

/** Puntaje total (máximo 10: cinco ejes × 2 puntos) para cada color. */
export const PUNTOS_PARA_VERDE = 8;
export const PUNTOS_PARA_AMARILLO = 4;
