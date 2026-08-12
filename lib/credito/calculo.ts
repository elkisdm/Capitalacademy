/**
 * Motor del simulador de crédito hipotecario.
 *
 * Funciones puras, sin I/O: se pueden correr en el servidor o en el navegador.
 * El único dato externo es el valor de la UF, que entra como parámetro
 * (ver `lib/indicadores/uf.ts`).
 *
 * Portado de "CALCULADORA CREDITO.xlsx". Las diferencias deliberadas con la
 * planilla van marcadas con "CORRECCIÓN" y están documentadas en el ADR-0027.
 */

import {
  BOLETAS_MINIMAS,
  CARGA_MAXIMA,
  CASTIGO_INGRESO,
  EDAD_MAXIMA_TERMINO,
  PIES,
  PLAZOS_ANIOS,
  RENTA_MINIMA_CLP,
} from "./constants";

export type Ingresos = {
  /** Últimas liquidaciones de sueldo líquido (la planilla pide 3). */
  sueldos: number[];
  /** Últimas boletas de honorarios (la planilla pide 6). */
  boletas: number[];
  /** Arriendo mensual percibido (oficinas, departamentos). */
  arriendoMensual: number;
  /** Retiros anuales código 104 del F22, oficializados en el SII. */
  retirosAnuales: number;
};

export type Pasivo = {
  tipo: "consumo" | "hipotecario" | "rotativo";
  /** Informativo: la planilla lo pide pero no lo usa en ningún cálculo. */
  deudaTotal: number;
  /** Lo único que resta de la renta. */
  valorCuota: number;
};

export type IngresoReconocido = {
  sueldo: number;
  boletas: number;
  arriendo: number;
  retiros: number;
  total: number;
  /** Motivos por los que alguna fuente quedó en cero pese a traer datos. */
  advertencias: string[];
};

export type Celda = {
  pie: number;
  plazoAnios: number;
  /** Dividendo mensual en pesos, sin seguros. */
  dividendo: number;
  /** Renta necesaria para que el dividendo sea, como mucho, la carga máxima. */
  rentaRequerida: number;
  califica: boolean;
  /** Presente solo cuando `califica` es false. */
  motivo?: "renta_insuficiente" | "plazo_excede_edad";
};

const promedio = (xs: number[]) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

const positivos = (xs: number[]) =>
  xs.filter((x) => Number.isFinite(x) && x > 0);

/**
 * Ingreso mensual que el banco reconoce, aplicando el castigo de cada fuente.
 *
 * CORRECCIÓN vs. planilla: `AVERAGE(B13:G13)` promediaba SIEMPRE entre 6 celdas,
 * así que quien ingresaba 3 boletas veía su ingreso reconocido reducido a la mitad.
 * Acá se promedian solo las boletas efectivamente ingresadas, exigiendo un mínimo
 * de `BOLETAS_MINIMAS` para reconocer la fuente.
 */
export function reconocerIngresos(ingresos: Ingresos): IngresoReconocido {
  const advertencias: string[] = [];

  const sueldo = promedio(positivos(ingresos.sueldos)) * CASTIGO_INGRESO.sueldo;

  const boletasValidas = positivos(ingresos.boletas);
  let boletas = 0;
  if (boletasValidas.length >= BOLETAS_MINIMAS) {
    boletas = promedio(boletasValidas) * CASTIGO_INGRESO.boletas;
  } else if (boletasValidas.length > 0) {
    advertencias.push(
      `Necesitas al menos ${BOLETAS_MINIMAS} boletas de honorarios para que el banco reconozca ese ingreso.`,
    );
  }

  const arriendo =
    Math.max(0, ingresos.arriendoMensual || 0) * CASTIGO_INGRESO.arriendo;

  const retiros =
    (Math.max(0, ingresos.retirosAnuales || 0) / 12) * CASTIGO_INGRESO.retiros;

  return {
    sueldo,
    boletas,
    arriendo,
    retiros,
    total: sueldo + boletas + arriendo + retiros,
    advertencias,
  };
}

/**
 * Renta final = ingreso reconocido − cuotas mensuales vigentes.
 *
 * La deuda total NO participa: la planilla la pide pero solo suma `valor cuota`
 * (`H23 = SUM(H20:H22)`). Se conserva ese criterio.
 */
export function rentaFinal(
  ingresoTotal: number,
  pasivos: Pasivo[],
): { cuotasMensuales: number; renta: number } {
  const cuotasMensuales = pasivos.reduce(
    (acc, p) => acc + Math.max(0, p.valorCuota || 0),
    0,
  );
  return { cuotasMensuales, renta: ingresoTotal - cuotasMensuales };
}

export function califica(renta: number): boolean {
  return renta >= RENTA_MINIMA_CLP;
}

/** Tasa mensual equivalente a una tasa anual, capitalización geométrica. */
export function tasaMensual(tasaAnual: number): number {
  return Math.pow(1 + tasaAnual, 1 / 12) - 1;
}

/**
 * Dividendo mensual en pesos, por amortización francesa:
 *
 *     cuota = M · i / (1 − (1 + i)^−n)
 *
 * `valorPropiedadUF` y el pie definen el monto financiado; el resultado se
 * convierte a pesos con el valor UF del día.
 */
export function dividendoMensual(params: {
  valorPropiedadUF: number;
  pie: number;
  tasaAnual: number;
  plazoAnios: number;
  valorUF: number;
}): number {
  const { valorPropiedadUF, pie, tasaAnual, plazoAnios, valorUF } = params;

  const montoUF = valorPropiedadUF * (1 - pie);
  const n = Math.round(plazoAnios * 12);
  if (montoUF <= 0 || n <= 0 || valorUF <= 0) return 0;

  const i = tasaMensual(tasaAnual);
  // Tasa 0: la cuota es la simple división del capital en n meses.
  const cuotaUF =
    i === 0 ? montoUF / n : (montoUF * i) / (1 - Math.pow(1 + i, -n));

  return cuotaUF * valorUF;
}

/**
 * Renta necesaria para que un dividendo no supere la carga permitida.
 *
 * `carga` existe para el Motor de Evaluación (ADR-0032), que usa carga
 * escalonada. Sin argumento se comporta igual que siempre: la calculadora
 * pública no se mueve.
 */
export function rentaRequerida(dividendo: number, carga = CARGA_MAXIMA): number {
  return dividendo / carga;
}

/**
 * Plazo máximo ofrecible según la edad, para que el crédito termine antes de
 * `EDAD_MAXIMA_TERMINO`. Devuelve `null` si ni el plazo más corto alcanza.
 *
 * CORRECCIÓN vs. planilla: allá era una tabla escrita a mano, con los años
 * 1974-1975 ausentes y 1979-1989 pisados por la matriz de dividendos (celdas
 * `J58:K62`). Acá es una regla. Reproduce la tabla salvo el año 1970, donde la
 * planilla redondeaba hacia arriba (ofrecía 25 años cuando la regla da 20).
 */
export function plazoMaximoPorEdad(edad: number): number | null {
  const disponibles = PLAZOS_ANIOS.filter(
    (p) => edad + p <= EDAD_MAXIMA_TERMINO,
  );
  return disponibles.length === 0 ? null : Math.max(...disponibles);
}

export function edadDesdeAnioNacimiento(
  anioNacimiento: number,
  hoy = new Date(),
): number {
  return hoy.getFullYear() - anioNacimiento;
}

/**
 * Matriz de escenarios: una fila por plazo, una columna por pie.
 *
 * CORRECCIÓN vs. planilla: allá convivían dos tablas (dividendos y renta
 * requerida) y era el usuario quien comparaba a ojo su renta contra cada celda.
 * Acá cada celda ya viene resuelta.
 */
export function matrizDividendos(params: {
  valorPropiedadUF: number;
  tasaAnual: number;
  valorUF: number;
  rentaDisponible: number;
  edad?: number;
  /** Carga máxima para calificar cada celda. Default: la de la pública (25%). */
  carga?: number;
}): Celda[][] {
  const { valorPropiedadUF, tasaAnual, valorUF, rentaDisponible, edad, carga } =
    params;
  // OJO: `plazoTope === null` es ambiguo — puede significar "no se dio edad" o
  // "la edad excede TODOS los plazos". Por eso se guarda `edadProvista` aparte:
  // sin esta distinción, una persona demasiado mayor calificaría a los 4 plazos.
  const edadProvista = edad !== undefined;
  const plazoTope = edadProvista ? plazoMaximoPorEdad(edad) : null;

  return PLAZOS_ANIOS.map((plazoAnios) =>
    PIES.map((pie) => {
      const dividendo = dividendoMensual({
        valorPropiedadUF,
        pie,
        tasaAnual,
        plazoAnios,
        valorUF,
      });
      const requerida = rentaRequerida(dividendo, carga);

      const excedeEdad =
        edadProvista && (plazoTope === null || plazoAnios > plazoTope);
      const rentaAlcanza = rentaDisponible >= requerida;

      return {
        pie,
        plazoAnios,
        dividendo,
        rentaRequerida: requerida,
        califica: !excedeEdad && rentaAlcanza,
        motivo: excedeEdad
          ? ("plazo_excede_edad" as const)
          : rentaAlcanza
            ? undefined
            : ("renta_insuficiente" as const),
      };
    }),
  );
}

export type Simulacion = {
  ingresos: IngresoReconocido;
  cuotasMensuales: number;
  rentaFinal: number;
  calificaPorRenta: boolean;
  plazoMaximo: number | null;
  matriz: Celda[][];
  /** El escenario que califica con el dividendo más alto, si hay alguno. */
  mejorEscenario: Celda | null;
};

/** Punto de entrada único: de los datos del formulario al resultado completo. */
export function simular(params: {
  ingresos: Ingresos;
  pasivos: Pasivo[];
  valorPropiedadUF: number;
  tasaAnual: number;
  valorUF: number;
  anioNacimiento?: number;
  hoy?: Date;
}): Simulacion {
  const ingresos = reconocerIngresos(params.ingresos);
  const { cuotasMensuales, renta } = rentaFinal(ingresos.total, params.pasivos);

  const edad =
    params.anioNacimiento === undefined
      ? undefined
      : edadDesdeAnioNacimiento(params.anioNacimiento, params.hoy);

  const matriz = matrizDividendos({
    valorPropiedadUF: params.valorPropiedadUF,
    tasaAnual: params.tasaAnual,
    valorUF: params.valorUF,
    rentaDisponible: renta,
    edad,
  });

  const queCalifican = matriz.flat().filter((c) => c.califica);
  const mejorEscenario =
    queCalifican.length === 0
      ? null
      : queCalifican.reduce((a, b) => (b.dividendo > a.dividendo ? b : a));

  return {
    ingresos,
    cuotasMensuales,
    rentaFinal: renta,
    calificaPorRenta: califica(renta),
    plazoMaximo: edad === undefined ? null : plazoMaximoPorEdad(edad),
    matriz,
    mejorEscenario,
  };
}
