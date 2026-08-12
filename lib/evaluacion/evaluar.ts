/**
 * "Analizar capacidad de compra": la cadena completa, de la ficha al resultado
 * (ADR-0032).
 *
 * Orquesta las piezas que ya existen y las nuevas, en el único orden que evita
 * la circularidad de la decisión 5: el perfil se calcula ANTES que la capacidad,
 * porque el financiamiento depende del perfil y no al revés.
 *
 *   ingresos → renta final → ¿califica? → crédito base → PERFIL → capacidad
 *
 * Pura y sin I/O: el valor de la UF entra por parámetro.
 */

import {
  reconocerIngresos,
  rentaFinal,
  califica,
  plazoMaximoPorEdad,
  edadDesdeAnioNacimiento,
} from "@/lib/credito/calculo";
import { RENTA_MINIMA_CLP, TASA_ANUAL_DEFAULT } from "@/lib/credito/constants";
import { capacidadDeCompra, creditoMaximo, type CapacidadDeCompra } from "@/lib/credito/capacidad";
import { perfilCrediticio, type PerfilCrediticio } from "./perfil";
import { patrimonioNeto, saldoHipotecarioVigente, type Ficha } from "./ficha";

export type EvaluacionRechazada = {
  califica: false;
  motivo: "renta_insuficiente" | "edad_sin_plazo";
  explicacion: string;
  /** Se muestran igual: el asesor necesita saber de qué cifra se parte. */
  ingresoReconocido: number;
  cuotasMensuales: number;
  rentaFinal: number;
  advertencias: string[];
};

export type EvaluacionAprobada = {
  califica: true;
  ingresoReconocido: number;
  cuotasMensuales: number;
  rentaFinal: number;
  advertencias: string[];
  edad: number;
  perfil: PerfilCrediticio;
  capacidad: CapacidadDeCompra;
  /**
   * La palanca que SÍ movería el valor máximo, según qué tope está mandando.
   * Los ejes del perfil afirman hechos y no prometen efectos justamente porque
   * el efecto depende de esto, que solo se conoce acá.
   */
  palanca: string;
};

export type Evaluacion = EvaluacionAprobada | EvaluacionRechazada;

export function evaluarFicha(
  ficha: Ficha,
  opciones: { valorUF: number; tasaAnual?: number; hoy?: Date },
): Evaluacion {
  const { valorUF, tasaAnual = TASA_ANUAL_DEFAULT, hoy } = opciones;

  const ingreso = reconocerIngresos({
    sueldos: ficha.sueldos,
    boletas: ficha.boletas,
    arriendoMensual: ficha.arriendoMensual,
    retirosAnuales: ficha.retirosAnuales,
  });

  const { cuotasMensuales, renta } = rentaFinal(ingreso.total, ficha.pasivos);

  const base = {
    ingresoReconocido: ingreso.total,
    cuotasMensuales,
    rentaFinal: renta,
    advertencias: ingreso.advertencias,
  };

  if (!califica(renta)) {
    const falta = RENTA_MINIMA_CLP - renta;
    return {
      ...base,
      califica: false,
      motivo: "renta_insuficiente",
      // Se dice qué falta, sin mostrar ningún tope: una cifra de propiedad
      // junto a un "no califica" es exactamente la ilusión que hay que evitar.
      explicacion: `La renta final queda ${clp(falta)} bajo el mínimo de ${clp(RENTA_MINIMA_CLP)} que exige el banco. Reducir cuotas vigentes o sumar un codeudor son los caminos habituales.`,
    };
  }

  const edad = edadDesdeAnioNacimiento(ficha.anioNacimiento, hoy);
  const plazoAnios = plazoMaximoPorEdad(edad);

  if (plazoAnios === null) {
    return {
      ...base,
      califica: false,
      motivo: "edad_sin_plazo",
      explicacion: `A los ${edad} años ningún plazo permite terminar el crédito antes del límite que exige el banco. Un comprador más joven como titular o codeudor abre la operación.`,
    };
  }

  const hipotecario = saldoHipotecarioVigente(ficha);

  // El crédito base NO depende del perfil (usa solo capacidad de pago y múltiplo
  // de renta). Por eso puede alimentar al perfil sin morderse la cola.
  const base_ = creditoMaximo({
    rentaMensual: renta,
    tasaAnual,
    plazoAnios,
    saldoHipotecarioVigente: hipotecario,
  });

  const perfil = perfilCrediticio(
    {
      fuenteRenta: ficha.fuenteRenta,
      antiguedadMeses: ficha.antiguedadMeses,
      cuotasMensuales,
      ingresoReconocido: ingreso.total,
      patrimonioNeto: patrimonioNeto(ficha),
      ahorroDisponible: ficha.ahorroDisponible,
      creditoBase: base_.monto,
    },
    valorUF,
  );

  const capacidad = capacidadDeCompra({
    rentaMensual: renta,
    ahorroDisponibleCLP: ficha.ahorroDisponible,
    tasaAnual,
    plazoAnios,
    perfil: perfil.color,
    valorUF,
    saldoHipotecarioVigente: hipotecario,
  });

  return {
    ...base,
    califica: true,
    edad,
    perfil,
    capacidad,
    palanca: PALANCA[capacidad.limitadoPor],
  };
}

/**
 * Qué mover para subir el valor máximo, según el tope que está mandando.
 *
 * Cada texto nombra la acción que de verdad cambia la cifra en ESE caso. Un
 * consejo genérico ("aumentar el pie") es falso la mitad de las veces, y en una
 * reunión el asesor lo repite como si fuera cierto.
 */
const PALANCA: Record<CapacidadDeCompra["limitadoPor"], string> = {
  capacidad_de_pago:
    "El tope lo pone la cuota que la renta soporta: subir la renta o prepagar deudas vigentes es lo que mueve la cifra. Más pie no la cambia.",
  multiplo_de_renta:
    "El tope lo pone el máximo que el banco presta contra esta renta: sumar un codeudor o acreditar más ingreso es lo que mueve la cifra. Más pie no la cambia.",
};

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
