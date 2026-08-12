/**
 * Perfil crediticio: los cinco ejes del semáforo (ADR-0032).
 *
 * DETERMINISTA Y SIN IA, a propósito. Dos asesores con la misma ficha deben ver
 * exactamente lo mismo; el resultado tiene que poder defenderse frente al banco;
 * y en una reunión nadie espera cuatro segundos por una respuesta. Un modelo,
 * además, puede alucinar cifras financieras. Una capa de lenguaje natural solo
 * tendría sentido ENCIMA de estos números, nunca en su lugar.
 *
 * NO MIRA LA CAPACIDAD DE COMPRA (decisión 5 del ADR-0032). El porcentaje de
 * financiamiento depende del perfil, así que si el perfil mirara la capacidad
 * —que ya depende del financiamiento— el cálculo se muerde la cola. Los ejes se
 * derivan solo de lo que el asesor ingresó, más `creditoBase`, que es el mínimo
 * entre capacidad de pago y múltiplo de renta y NO depende del perfil.
 */

import type { ColorPerfil } from "@/lib/credito/capacidad-constants";
import {
  ANTIGUEDAD,
  CARGA_FINANCIERA,
  ESTABILIDAD_POR_FUENTE,
  PATRIMONIO_MINIMO_SOBRE_VALOR,
  PIE_PROPORCION_ESCENARIO_ALTO,
  PIE_PROPORCION_ESCENARIO_BAJO,
  PUNTOS_PARA_VERDE,
  PUNTOS_PARA_AMARILLO,
  VALOR_REFERENCIA_FINANCIAMIENTO,
  type EstadoEje,
  type FuenteRenta,
} from "./perfil-constants";

export type { EstadoEje, FuenteRenta };

export type DatosPerfil = {
  fuenteRenta: FuenteRenta;
  antiguedadMeses: number;
  /** Suma de cuotas mensuales vigentes. */
  cuotasMensuales: number;
  /** Ingreso ya reconocido por el banco (salida de `reconocerIngresos`). */
  ingresoReconocido: number;
  /** Activos menos pasivos. Puede ser negativo. */
  patrimonioNeto: number;
  ahorroDisponible: number;
  /**
   * Mínimo entre capacidad de pago y múltiplo de renta, en pesos.
   * Es la referencia para medir ahorro y patrimonio SIN depender del perfil.
   */
  creditoBase: number;
};

export type Eje = {
  clave: "estabilidad" | "antiguedad" | "carga" | "patrimonio" | "ahorro";
  titulo: string;
  estado: EstadoEje;
  /** Lo que se muestra como fortaleza si está en verde. */
  fortaleza: string;
  /**
   * Qué haría subir este eje, con la cifra exacta cuando aplica.
   * `null` cuando el eje ya está en verde.
   *
   * El número es lo que convierte el semáforo en una herramienta de conversación
   * en vez de un adorno: "aumentar el pie" no le sirve a nadie; "te faltan 180 UF
   * de pie" sí.
   */
  mejora: string | null;
};

export type PerfilCrediticio = {
  color: ColorPerfil;
  resumen: string;
  ejes: Eje[];
  fortalezas: string[];
  mejoras: string[];
  puntaje: number;
};

const PUNTOS: Record<EstadoEje, number> = { verde: 2, amarillo: 1, rojo: 0 };

const clp = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-CL", { maximumFractionDigits: 0 });

const uf = (n: number) =>
  Math.round(n).toLocaleString("es-CL", { maximumFractionDigits: 0 }) + " UF";

// --- Los cinco ejes ---------------------------------------------------------

function ejeEstabilidad(d: DatosPerfil): Eje {
  const estado = ESTABILIDAD_POR_FUENTE[d.fuenteRenta];
  return {
    clave: "estabilidad",
    titulo: "Estabilidad de renta",
    estado,
    fortaleza: "Renta estable y verificable",
    mejora:
      estado === "verde"
        ? null
        : estado === "amarillo"
          ? "Un contrato indefinido como fuente principal mejora la evaluación"
          : "Con solo boletas de honorarios el banco exige más historial: 12 a 24 meses de continuidad",
  };
}

function ejeAntiguedad(d: DatosPerfil): Eje {
  const meses = Math.max(0, d.antiguedadMeses);
  const estado: EstadoEje =
    meses >= ANTIGUEDAD.verdeMeses
      ? "verde"
      : meses >= ANTIGUEDAD.amarilloMeses
        ? "amarillo"
        : "rojo";

  const faltan =
    estado === "verde" ? 0 : ANTIGUEDAD.verdeMeses - meses;

  return {
    clave: "antiguedad",
    titulo: "Antigüedad laboral",
    estado,
    fortaleza: "Antigüedad laboral suficiente",
    mejora:
      estado === "verde"
        ? null
        : `Faltan ${faltan} ${faltan === 1 ? "mes" : "meses"} para alcanzar los ${ANTIGUEDAD.verdeMeses / 12} años que el banco valora`,
  };
}

function ejeCarga(d: DatosPerfil): Eje {
  const ingreso = Math.max(0, d.ingresoReconocido);
  const cuotas = Math.max(0, d.cuotasMensuales);
  // Sin ingreso no hay proporción que calcular; el caso lo atrapa antes la
  // renta mínima, así que acá basta con no dividir por cero.
  const proporcion = ingreso > 0 ? cuotas / ingreso : 1;

  const estado: EstadoEje =
    proporcion < CARGA_FINANCIERA.verdeMax
      ? "verde"
      : proporcion <= CARGA_FINANCIERA.amarilloMax
        ? "amarillo"
        : "rojo";

  // Cuánto habría que bajar las cuotas para entrar al tramo siguiente.
  const objetivo =
    estado === "rojo" ? CARGA_FINANCIERA.amarilloMax : CARGA_FINANCIERA.verdeMax;
  const cuotaObjetivo = ingreso * objetivo;
  const exceso = Math.max(0, cuotas - cuotaObjetivo);

  return {
    clave: "carga",
    titulo: "Carga financiera",
    estado,
    fortaleza: "Bajo nivel de endeudamiento",
    mejora:
      estado === "verde"
        ? null
        : `Prepagar deudas por ${clp(exceso)} mensuales baja la carga a ${Math.round(objetivo * 100)}% de la renta`,
  };
}

function ejePatrimonio(d: DatosPerfil): Eje {
  // Valor de referencia derivado de `creditoBase`, que no depende del perfil.
  const valorReferencia = d.creditoBase / VALOR_REFERENCIA_FINANCIAMIENTO;
  const minimoVerde = valorReferencia * PATRIMONIO_MINIMO_SOBRE_VALOR;

  const estado: EstadoEje =
    d.patrimonioNeto >= minimoVerde
      ? "verde"
      : d.patrimonioNeto > 0
        ? "amarillo"
        : "rojo";

  return {
    clave: "patrimonio",
    titulo: "Patrimonio neto",
    estado,
    fortaleza: "Patrimonio positivo y sólido",
    mejora:
      estado === "verde"
        ? null
        : estado === "amarillo"
          ? `Un patrimonio sobre ${clp(minimoVerde)} respalda mejor la operación`
          : "Un patrimonio neto negativo pesa en la evaluación: reducir pasivos antes de postular",
  };
}

function ejeAhorro(d: DatosPerfil, valorUF: number): Eje {
  // El pie que exigiría cada escenario de financiamiento, medido contra
  // `creditoBase`. Cubrir el pie del escenario BAJO (más financiamiento propio)
  // es lo exigente, y por eso es lo que da verde.
  const pieExigente = d.creditoBase * PIE_PROPORCION_ESCENARIO_BAJO;
  const pieHolgado = d.creditoBase * PIE_PROPORCION_ESCENARIO_ALTO;
  const ahorro = Math.max(0, d.ahorroDisponible);

  const estado: EstadoEje =
    ahorro >= pieExigente ? "verde" : ahorro >= pieHolgado ? "amarillo" : "rojo";

  const objetivo = estado === "rojo" ? pieHolgado : pieExigente;
  const faltante = Math.max(0, objetivo - ahorro);

  return {
    clave: "ahorro",
    titulo: "Capacidad de ahorro",
    estado,
    fortaleza: "Buena capacidad de ahorro para el pie",
    // El texto afirma el HECHO (cuánto falta para cubrir ese pie) y NO promete
    // que subirá el valor alcanzable: cuando el límite es el múltiplo de renta,
    // más pie no mueve el tope y la promesa sería falsa. Quien conoce el
    // limitante es la pantalla de resultado, y es ahí donde corresponde
    // destacar la palanca que sí cambia la cifra.
    mejora:
      estado === "verde"
        ? null
        : `Con ${uf(faltante / valorUF)} más de pie (${clp(faltante)}) cubriría el 20% que piden las mejores condiciones`,
  };
}

// --- Composición ------------------------------------------------------------

/**
 * Perfil crediticio a partir de los datos de la ficha.
 *
 * `valorUF` entra solo para expresar el faltante de pie en UF, que es la unidad
 * en la que se habla de propiedades en Chile.
 */
export function perfilCrediticio(d: DatosPerfil, valorUF: number): PerfilCrediticio {
  const ejes: Eje[] = [
    ejeEstabilidad(d),
    ejeAntiguedad(d),
    ejeCarga(d),
    ejePatrimonio(d),
    ejeAhorro(d, valorUF),
  ];

  const puntaje = ejes.reduce((acc, e) => acc + PUNTOS[e.estado], 0);

  // Una carga financiera en rojo bloquea el verde por más puntos que sumen los
  // otros ejes: es el eje que el banco mira primero y el único que puede tumbar
  // una operación por sí solo.
  const cargaEnRojo = ejes.find((e) => e.clave === "carga")?.estado === "rojo";

  const color: ColorPerfil =
    puntaje >= PUNTOS_PARA_VERDE && !cargaEnRojo
      ? "verde"
      : puntaje >= PUNTOS_PARA_AMARILLO
        ? "amarillo"
        : "rojo";

  return {
    color,
    resumen: RESUMEN[color],
    ejes,
    fortalezas: ejes.filter((e) => e.estado === "verde").map((e) => e.fortaleza),
    mejoras: ejes
      .filter((e) => e.mejora !== null)
      .map((e) => e.mejora as string),
    puntaje,
  };
}

/**
 * El texto habla de EVALUAR, nunca de aprobar. Un "perfil favorable" se lee como
 * una preaprobación bancaria si nadie aclara lo contrario, y esa confusión la
 * paga el cliente semanas después cuando el banco dice que no.
 */
// Sin repetir el color en el texto: el título del bloque ya dice "Perfil
// favorable/intermedio/restringido" y duplicarlo leía como eco.
const RESUMEN: Record<ColorPerfil, string> = {
  verde: "Los antecedentes respaldan bien la operación: se pueden evaluar alternativas.",
  amarillo: "La operación es viable, y hay variables concretas que la mejorarían.",
  rojo: "Conviene trabajar los puntos de abajo antes de postular al banco.",
};
