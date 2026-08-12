/**
 * Ficha de Estado de Situación — Paso 7 de la metodología comercial (ADR-0032).
 *
 * Es lo que el asesor completa junto al cliente en la reunión. Hoy vive en un
 * Excel/PDF que se llena a mano y después se retipea en la calculadora; acá es
 * un tipo validado que alimenta el motor directamente.
 *
 * IMPORTANTE (decisión 1 del ADR-0032): esta estructura NO se persiste en v1.
 * Contiene datos financieros de un tercero identificado que no es usuario de la
 * plataforma. Vive en el navegador durante la reunión y desaparece al cerrarla.
 * Si algún día se guarda, esa decisión trae consentimiento, retención y RLS.
 */

import { z } from "zod";
import { isValidRut } from "@/lib/utils/rut";

const monto = z
  .number({ message: "Debe ser un número" })
  .min(0, "No puede ser negativo")
  .finite("Debe ser un número válido");

const montoOpcional = monto.optional().default(0);

export const fichaSchema = z.object({
  // --- Antecedentes personales ---------------------------------------------
  nombre: z.string().trim().min(1, "El nombre es requerido").max(120),
  rut: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidRut(v), "El RUT no es válido")
    .optional()
    .default(""),
  anioNacimiento: z
    .number({ message: "Indica el año de nacimiento" })
    .int("Debe ser un año")
    // El rango evita el error de tipeo que más daño hace acá: un año de dos
    // dígitos o invertido produce una edad absurda y con ella un plazo absurdo.
    .min(1930, "Revisa el año de nacimiento")
    .max(new Date().getFullYear() - 18, "El cliente debe ser mayor de edad"),

  // --- Situación laboral ----------------------------------------------------
  fuenteRenta: z.enum(["sueldo_indefinido", "sueldo_plazo_fijo", "mixto", "honorarios"], {
    message: "Indica de dónde proviene la renta",
  }),
  antiguedadMeses: z
    .number({ message: "Indica la antigüedad laboral" })
    .int()
    .min(0, "No puede ser negativa")
    .max(720, "Revisa la antigüedad (máximo 60 años)"),

  // --- Ingresos -------------------------------------------------------------
  // Se piden como lista y no como promedio para que el motor aplique la
  // corrección #1 del ADR-0027: promediar solo lo ingresado, no dividir siempre
  // entre 6.
  sueldos: z.array(monto).max(12).optional().default([]),
  boletas: z.array(monto).max(12).optional().default([]),
  arriendoMensual: montoOpcional,
  retirosAnuales: montoOpcional,

  // --- Pasivos --------------------------------------------------------------
  pasivos: z
    .array(
      z.object({
        tipo: z.enum(["consumo", "hipotecario", "rotativo"]),
        deudaTotal: montoOpcional,
        valorCuota: montoOpcional,
      }),
    )
    .max(20)
    .optional()
    .default([]),

  // --- Patrimonio y ahorro --------------------------------------------------
  /** Suma de propiedades, vehículos e inversiones, a valor de mercado. */
  activosTotales: montoOpcional,
  /** Lo que el cliente tiene disponible HOY para el pie. */
  ahorroDisponible: montoOpcional,
});

export type Ficha = z.infer<typeof fichaSchema>;

/** Ficha vacía para inicializar el formulario. */
export function fichaVacia(): Ficha {
  return {
    nombre: "",
    rut: "",
    anioNacimiento: new Date().getFullYear() - 35,
    fuenteRenta: "sueldo_indefinido",
    antiguedadMeses: 0,
    // Las 3 liquidaciones parten visibles: siempre se piden las últimas 3, y
    // así el asesor tipea directo en vez de dar 3 clics de "Agregar". Un 0 no
    // afecta el cálculo (el motor promedia solo montos positivos).
    sueldos: [0, 0, 0],
    boletas: [],
    arriendoMensual: 0,
    retirosAnuales: 0,
    pasivos: [],
    activosTotales: 0,
    ahorroDisponible: 0,
  };
}

/**
 * Saldo de créditos HIPOTECARIOS vigentes.
 *
 * Es lo que se descuenta del tope de 60× renta: quien ya tiene un hipotecario a
 * medio pagar no puede volver a pedir el máximo. Los créditos de consumo y las
 * líneas rotativas no se descuentan de ahí —ya pesan por su cuota mensual, y
 * descontarlos dos veces castigaría de más.
 */
export function saldoHipotecarioVigente(ficha: Ficha): number {
  return ficha.pasivos
    .filter((p) => p.tipo === "hipotecario")
    .reduce((acc, p) => acc + Math.max(0, p.deudaTotal), 0);
}

/**
 * Patrimonio neto = activos − deudas totales.
 *
 * Acá `deudaTotal` entra por segunda vía a un cálculo real. Hasta el ADR-0027 se
 * pedía en el formulario y no se usaba en ninguna parte (su corrección #6 lo
 * dejó registrado como deuda deliberada).
 */
export function patrimonioNeto(ficha: Ficha): number {
  const deudas = ficha.pasivos.reduce((acc, p) => acc + Math.max(0, p.deudaTotal), 0);
  return ficha.activosTotales - deudas;
}
