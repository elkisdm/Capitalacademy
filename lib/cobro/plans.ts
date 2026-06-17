/**
 * Planes de cuotas del cobro genérico.
 *
 * A diferencia del Diplomado/Liderazgo —donde el monto base es fijo y los
 * recargos viven como montos absolutos— el cobro genérico tiene un monto base
 * VARIABLE (el monto firmado por HMAC). Por eso acá el recargo se modela como
 * FACTOR multiplicativo y el monto final se computa sobre el base firmado.
 *
 * Los factores son los mismos que ya usan los checkouts (cubren la comisión de
 * Webpay sobre cuotas; el pagador asume el costo):
 *   6 cuotas  → +6,68%  (×1,0668)
 *   12 cuotas → +10,18% (×1,1018)
 *
 * SEGURIDAD: la firma del cobro cubre solo el monto BASE (contado). El servidor
 * recomputa el monto final con `resolveCobroAmount` a partir del plan elegido;
 * el cliente nunca es la fuente de verdad del monto. Elegir cuotas solo puede
 * AUMENTAR el cobro (recargo), nunca reducirlo por debajo del base firmado.
 */

export type CobroPlan = "contado" | "cobro-6" | "cobro-12";

interface CobroPlanConfig {
  /** Factor multiplicativo sobre el monto base (1 = sin recargo). */
  factor: number;
  /** paymentMethod de Flow: 1 = Webpay (fuerza tarjeta), 9 = todos los medios. */
  paymentMethod: number;
  label: string;
  description: string;
  /** Sufijo para el subject de Flow (aparece en la boleta/recibo). */
  subjectSuffix: string;
}

export const COBRO_PLANS: Record<CobroPlan, CobroPlanConfig> = {
  contado: {
    factor: 1,
    paymentMethod: 9,
    label: "Pago contado",
    description: "Webpay 1 cuota, débito o transferencia",
    subjectSuffix: "",
  },
  "cobro-6": {
    factor: 1.0668,
    paymentMethod: 1,
    label: "6 cuotas",
    description: "Tarjeta de crédito en 6 cuotas (incluye recargo)",
    subjectSuffix: " — 6 cuotas",
  },
  "cobro-12": {
    factor: 1.1018,
    paymentMethod: 1,
    label: "12 cuotas",
    description: "Tarjeta de crédito en 12 cuotas (incluye recargo)",
    subjectSuffix: " — 12 cuotas",
  },
};

export const COBRO_PLAN_KEYS = Object.keys(COBRO_PLANS) as CobroPlan[];

export function isCobroPlan(value: unknown): value is CobroPlan {
  return (
    typeof value === "string" && (COBRO_PLAN_KEYS as string[]).includes(value)
  );
}

/** Monto final a cobrar = monto base × factor del plan, redondeado a CLP entero. */
export function resolveCobroAmount(baseClp: number, plan: CobroPlan): number {
  return Math.round(baseClp * COBRO_PLANS[plan].factor);
}
