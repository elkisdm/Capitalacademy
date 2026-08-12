/**
 * Import de la Ficha de Estado de Situación desde el Excel del portal de
 * crédito ("EESS - PORTAL CREDITO - CLIENTES", hoja DECLARACION).
 *
 * El Excel es un formulario de celdas fijas: cada dato vive en una coordenada
 * conocida de la plantilla. Este módulo mapea esas coordenadas al tipo `Ficha`
 * sin tocar el DOM ni la red: recibe un lector de celdas y devuelve la ficha.
 * Quien lo llama (el componente) es responsable de abrir el archivo EN EL
 * NAVEGADOR — el contenido nunca viaja a un servidor (decisión 1 del ADR-0032).
 *
 * Los totales (TOTAL INGRESOS, TOTAL AHORROS) NO se leen: son fórmulas cuyo
 * valor cacheado depende de con qué programa se guardó el archivo. Se suman
 * siempre las celdas componentes.
 */

import { cleanRut, formatRut, isValidRut } from "@/lib/utils/rut";
import { fichaVacia, type Ficha } from "./ficha";

/** Lector de una celda por coordenada ("D12") → valor crudo o undefined. */
export type LectorCeldas = (coordenada: string) => unknown;

/** Forma mínima de una celda de SheetJS que este módulo necesita conocer. */
type CeldaXlsx = { t?: string; v?: unknown } | undefined;

/**
 * Lector de celdas sobre una hoja de SheetJS.
 *
 * Filtra las celdas con error de fórmula (`t === "e"`): su `.v` es un código
 * numérico (#REF! = 23, #VALUE! = 15…) que de otro modo entraría al cálculo
 * como un monto chico de verdad.
 */
export function lectorDeHoja(hoja: Record<string, unknown>): LectorCeldas {
  return (coordenada) => {
    const celda = hoja[coordenada] as CeldaXlsx;
    if (!celda || celda.t === "e") return undefined;
    return celda.v;
  };
}

export type ImporteEESS = {
  ficha: Ficha;
  /** Campos que el Excel no captura bien y el asesor debe revisar. */
  avisos: string[];
};

export class ArchivoNoEsEESSError extends Error {
  constructor() {
    super(
      "El archivo no parece la Ficha de Estado de Situación (EESS). Verifica que sea el Excel del portal de crédito, hoja DECLARACION.",
    );
    this.name = "ArchivoNoEsEESSError";
  }
}

/** Nombre de la hoja que contiene el formulario. */
export const HOJA_EESS = "DECLARACION";

/** Marcador que identifica la plantilla (título del formulario). */
const CELDA_MARCADOR = "C8";
const TEXTO_MARCADOR = "ESTADO DE SITUACION";

// --- Coordenadas de la plantilla ------------------------------------------
// Datos del titular: etiquetas en C/G, valores en D (izquierda) e I (derecha).
const CELDAS = {
  nombre: "D12",
  rut: "D13",
  fechaNacimiento: "D15",
  fechaIngresoLaboral: "D25",
  // Antecedentes financieros: ingresos en D37:D40, ahorros en G37:G40.
  sueldo: "D37",
  honorarios: "D38",
  arriendos: "D39",
  retiros: "D40",
  ahorros: ["G37", "G38", "G39", "G40"],
} as const;

// Secciones tabulares: filas de datos bajo cada encabezado. Los rangos son
// generosos (la plantilla trae más filas que las visibles con borde) y solo
// se toma una fila si trae algún monto: los bancos pre-tipeados sin cifras
// (FALABELLA, SANTANDER) no generan pasivos.
const FILAS = {
  vehiculos: { desde: 46, hasta: 49, valorComercial: "F", valorCuota: "G" },
  propiedades: {
    desde: 52,
    hasta: 57,
    valorComercialUF: "D",
    saldoInsolutoUF: "E",
    valorCuota: "F",
  },
  consumo: { desde: 60, hasta: 65, saldoDeuda: "E", montoCuota: "F" },
  tarjetas: { desde: 68, hasta: 71, montoUtilizado: "E" },
  lineas: { desde: 68, hasta: 71, montoUtilizado: "J" },
} as const;

/**
 * Convierte lo que venga en una celda a un monto en pesos (entero).
 *
 * El asesor tipea con puntos de miles, signo $ o como número a secas según
 * quién llenó el archivo — y si el Excel pasó por un programa en inglés, los
 * separadores vienen invertidos ("2,800,000.00"). La regla que resuelve ambos
 * mundos: cuando hay punto y coma, el que aparece ÚLTIMO es el decimal; con un
 * solo separador, es de miles si va seguido de exactamente 3 dígitos.
 *
 * Se redondea siempre: un decimal que se filtre rompe la máscara de miles del
 * formulario (`maskMonto` elimina el punto decimal como si fuera de miles y el
 * monto se muestra 10x-100x más grande).
 */
export function montoDesdeCelda(valor: unknown): number {
  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor > 0 ? Math.round(valor) : 0;
  }
  if (typeof valor !== "string") return 0;

  let limpio = valor.replace(/[$\s]/g, "");
  if (!/^[\d.,]+$/.test(limpio) || !/\d/.test(limpio)) return 0;

  const ultimoPunto = limpio.lastIndexOf(".");
  const ultimaComa = limpio.lastIndexOf(",");
  if (ultimoPunto !== -1 && ultimaComa !== -1) {
    // Ambos separadores: el último es el decimal, el otro es de miles.
    const decimal = ultimoPunto > ultimaComa ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    limpio = limpio.split(miles).join("").replace(decimal, ".");
  } else if (ultimoPunto !== -1 || ultimaComa !== -1) {
    const separador = ultimoPunto !== -1 ? "." : ",";
    const partes = limpio.split(separador);
    // "2.800.000" / "2,800,000" (repetido) o "2.800" / "2,800" (grupo de 3):
    // separador de miles. "2500.5" / "350000,5": decimal.
    const esMiles = partes.length > 2 || partes[partes.length - 1].length === 3;
    limpio = esMiles ? partes.join("") : partes.join(".");
  }

  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Año de una celda de fecha de Excel.
 *
 * Puede venir como Date (SheetJS con `cellDates`), como número serial de Excel
 * (días desde 1900) o como texto "12/05/1985" / "1985".
 */
export function anioDesdeCelda(valor: unknown): number | null {
  return anioMesDesdeCelda(valor)?.anio ?? null;
}

/** Meses transcurridos desde una celda de fecha hasta hoy. */
export function mesesDesdeCelda(valor: unknown, hoy: Date): number | null {
  const fecha = anioMesDesdeCelda(valor);
  if (!fecha || fecha.mes === null) return null;
  const meses =
    (hoy.getFullYear() - fecha.anio) * 12 + (hoy.getMonth() - (fecha.mes - 1));
  return meses >= 0 ? meses : null;
}

/** Año (y mes 1-12 cuando la celda lo trae) de una celda de fecha. */
function anioMesDesdeCelda(valor: unknown): { anio: number; mes: number | null } | null {
  // Date de SheetJS con `cellDates`: llega a medianoche LOCAL → getters locales.
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return { anio: valor.getFullYear(), mes: valor.getMonth() + 1 };
  }
  if (typeof valor === "number" && Number.isFinite(valor)) {
    // Serial de Excel: 1 = 1900-01-01. Un año suelto (1985) también es un
    // número, así que se distingue por rango: los seriales plausibles de una
    // fecha de nacimiento/ingreso laboral superan 10.000 (año 1927).
    if (valor >= 1900 && valor <= 2100) return { anio: Math.trunc(valor), mes: null };
    if (valor > 10_000) {
      // El serial se convierte a medianoche UTC: los getters deben ser UTC.
      // Con getters locales, en Chile (UTC-4/-3) toda fecha retrocede un día
      // y el 01/01/1990 se lee como 1989.
      const fecha = new Date(Math.round((valor - 25_569) * 86_400_000));
      return { anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1 };
    }
    return null;
  }
  if (typeof valor === "string") {
    // dd/mm/aaaa o dd-mm-aaaa, el formato en que se tipea en Chile.
    const m = valor.match(/(\d{1,2})[/-](\d{1,2})[/-]((?:19|20)\d{2})/);
    if (m) {
      const mes = Number(m[2]);
      if (mes >= 1 && mes <= 12) return { anio: Number(m[3]), mes };
    }
    const suelto = valor.match(/(19|20)\d{2}/);
    if (suelto) return { anio: Number(suelto[0]), mes: null };
  }
  return null;
}

/**
 * Mapea la hoja DECLARACION a una `Ficha`.
 *
 * @throws ArchivoNoEsEESSError si la celda marcador no trae el título esperado.
 */
export function importarEESS(
  celda: LectorCeldas,
  opciones: { valorUF: number; hoy?: Date },
): ImporteEESS {
  const marcador = celda(CELDA_MARCADOR);
  if (typeof marcador !== "string" || !marcador.toUpperCase().includes(TEXTO_MARCADOR)) {
    throw new ArchivoNoEsEESSError();
  }

  const { valorUF, hoy = new Date() } = opciones;
  const avisos: string[] = [];
  const ficha: Ficha = fichaVacia();

  // --- Titular --------------------------------------------------------------
  const nombre = celda(CELDAS.nombre);
  if (typeof nombre === "string" && nombre.trim()) ficha.nombre = nombre.trim().slice(0, 120);

  // El RUT pasa por los mismos helpers que la máscara del formulario: un RUT
  // inválido importado tal cual bloquearía TODO el análisis en la validación
  // (el schema lo rechaza), así que se deja vacío y se avisa.
  const rutCrudo = celda(CELDAS.rut);
  const rutTexto =
    typeof rutCrudo === "string" ? rutCrudo.trim() : typeof rutCrudo === "number" ? String(rutCrudo) : "";
  if (rutTexto) {
    if (isValidRut(rutTexto) && cleanRut(rutTexto).length <= 9) {
      ficha.rut = formatRut(rutTexto);
    } else {
      avisos.push("El RUT del Excel no es válido: complétalo a mano si lo necesitas.");
    }
  }

  // Si la fecha no se puede leer, el año queda VACÍO (0) y la validación exige
  // completarlo antes de analizar: heredar el default de la ficha vacía haría
  // correr la evaluación con una edad ficticia de 35 años.
  const anio = anioDesdeCelda(celda(CELDAS.fechaNacimiento));
  ficha.anioNacimiento = anio ?? 0;
  if (anio === null) {
    avisos.push("No se pudo leer la fecha de nacimiento: completa el año antes de analizar.");
  }

  const antiguedad = mesesDesdeCelda(celda(CELDAS.fechaIngresoLaboral), hoy);
  if (antiguedad !== null) ficha.antiguedadMeses = Math.min(antiguedad, 720);
  else avisos.push("No se pudo leer la fecha de ingreso laboral: revisa la antigüedad.");

  // --- Ingresos ---------------------------------------------------------------
  const sueldo = montoDesdeCelda(celda(CELDAS.sueldo));
  const honorarios = montoDesdeCelda(celda(CELDAS.honorarios));
  if (sueldo > 0) ficha.sueldos = [sueldo];
  if (honorarios > 0) ficha.boletas = [honorarios];
  ficha.arriendoMensual = montoDesdeCelda(celda(CELDAS.arriendos));

  // La celda RETIROS del Excel no dice si es mensual o anual; la ficha pide el
  // monto ANUAL. Se importa tal cual (importar de menos es conservador) y se
  // pide revisión en vez de multiplicar a ciegas.
  const retiros = montoDesdeCelda(celda(CELDAS.retiros));
  if (retiros > 0) {
    ficha.retirosAnuales = retiros;
    avisos.push("Retiros: la ficha pide el monto ANUAL; confirma que la cifra importada lo sea.");
  }

  // El Excel no distingue el tipo de contrato del sueldo.
  if (sueldo > 0 && honorarios > 0) {
    ficha.fuenteRenta = "mixto";
    avisos.push(
      "Fuente de renta: hay sueldo y honorarios, se importó como mixto — revísala si no corresponde.",
    );
  } else if (honorarios > 0) {
    ficha.fuenteRenta = "honorarios";
  } else {
    ficha.fuenteRenta = "sueldo_indefinido";
    if (sueldo > 0) {
      avisos.push(
        "Fuente de renta: el Excel no indica el tipo de contrato; se asumió indefinido — corrígelo si es a plazo fijo.",
      );
    }
  }
  if (honorarios > 0) {
    avisos.push(
      "Honorarios: el Excel trae un solo monto; agrega más boletas para un promedio real (el banco exige al menos 3).",
    );
  }

  // --- Pasivos y activos ------------------------------------------------------
  let activos = 0;
  let hayRotativos = false;

  for (let f = FILAS.vehiculos.desde; f <= FILAS.vehiculos.hasta; f++) {
    activos += montoDesdeCelda(celda(`${FILAS.vehiculos.valorComercial}${f}`));
    const cuota = montoDesdeCelda(celda(`${FILAS.vehiculos.valorCuota}${f}`));
    if (cuota > 0) ficha.pasivos.push({ tipo: "consumo", deudaTotal: 0, valorCuota: cuota });
  }

  for (let f = FILAS.propiedades.desde; f <= FILAS.propiedades.hasta; f++) {
    // Propiedades: valores y saldos en UF, cuota en pesos.
    activos += montoDesdeCelda(celda(`${FILAS.propiedades.valorComercialUF}${f}`)) * valorUF;
    const saldoUF = montoDesdeCelda(celda(`${FILAS.propiedades.saldoInsolutoUF}${f}`));
    const cuota = montoDesdeCelda(celda(`${FILAS.propiedades.valorCuota}${f}`));
    if (saldoUF > 0 || cuota > 0) {
      ficha.pasivos.push({
        tipo: "hipotecario",
        deudaTotal: Math.round(saldoUF * valorUF),
        valorCuota: cuota,
      });
    }
  }

  for (let f = FILAS.consumo.desde; f <= FILAS.consumo.hasta; f++) {
    const saldo = montoDesdeCelda(celda(`${FILAS.consumo.saldoDeuda}${f}`));
    const cuota = montoDesdeCelda(celda(`${FILAS.consumo.montoCuota}${f}`));
    if (saldo > 0 || cuota > 0) {
      ficha.pasivos.push({ tipo: "consumo", deudaTotal: saldo, valorCuota: cuota });
    }
  }

  for (const seccion of [FILAS.tarjetas, FILAS.lineas]) {
    for (let f = seccion.desde; f <= seccion.hasta; f++) {
      const utilizado = montoDesdeCelda(celda(`${seccion.montoUtilizado}${f}`));
      if (utilizado > 0) {
        ficha.pasivos.push({ tipo: "rotativo", deudaTotal: utilizado, valorCuota: 0 });
        hayRotativos = true;
      }
    }
  }
  if (hayRotativos) {
    avisos.push(
      "Tarjetas o líneas con saldo: el Excel no trae su cuota mensual; agrégala si el cliente paga una.",
    );
  }

  // El schema admite hasta 20 pasivos. Si el Excel trae más, botar el exceso
  // en silencio subestimaría la deuda e inflaría la capacidad de compra.
  if (ficha.pasivos.length > 20) {
    avisos.push(
      `El Excel trae ${ficha.pasivos.length} deudas y la ficha admite 20: se importaron las primeras 20 — consolida las restantes a mano.`,
    );
    ficha.pasivos = ficha.pasivos.slice(0, 20);
  }

  // --- Ahorro -------------------------------------------------------------------
  // Se suman las celdas componentes (ahorros, depósito a plazo, FFMM, otros);
  // la celda TOTAL AHORROS es una fórmula y no se lee.
  const ahorro = CELDAS.ahorros.reduce((acc, c) => acc + montoDesdeCelda(celda(c)), 0);
  ficha.ahorroDisponible = ahorro;
  // Los instrumentos de ahorro también son parte de los activos a valor de mercado.
  ficha.activosTotales = Math.round(activos + ahorro);

  return { ficha, avisos };
}
