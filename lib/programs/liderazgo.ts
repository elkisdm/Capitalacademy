import { z } from "zod";
import { cleanRut, isValidRut } from "@/lib/utils/rut";
import { invoiceExtension, refineInvoice } from "@/lib/payments/invoice";

/**
 * Programa de Liderazgo y Gestión de Equipos Comerciales.
 *
 * A diferencia del Diplomado, el descuento de lanzamiento NO se modela como
 * cupón de porcentaje (el motor de % no puede reproducir los montos exactos
 * que comunica Paola en las cuotas). En su lugar, cada plan tiene su precio
 * normal (`amount`) y su precio de lanzamiento explícito (`launchAmount`), y
 * el código de lanzamiento los desbloquea. El monto cobrado SIEMPRE se
 * recomputa en el servidor; el cliente nunca es la fuente de verdad.
 */

export const LIDERAZGO_REGULAR_PRICE_CLP = 450_000;

export const LIDERAZGO_SUBJECT =
  "Programa de Liderazgo y Gestión de Equipos Comerciales";

export const LIDERAZGO_PROGRAM_NAME = LIDERAZGO_SUBJECT;
export const LIDERAZGO_PROGRAM_SHORT = "Programa de Liderazgo";

/**
 * Código de lanzamiento que desbloquea los precios `launchAmount`.
 * Es un código de marketing (público, se comparte con los interesados),
 * por eso vive como constante compartida cliente/servidor. El servidor
 * recomputa el monto a partir de él, así que exponerlo no es un riesgo.
 */
export const LIDERAZGO_LAUNCH_CODE = "LIDERAZGO20";

export type LiderazgoPlan = "lid-contado" | "lid-46" | "lid-712";

interface LiderazgoPlanConfig {
  /** Precio normal (sin código de lanzamiento). */
  amount: number;
  /** Precio con código de lanzamiento aplicado (exacto, según Paola). */
  launchAmount: number;
  /** paymentMethod de Flow: 1 = Webpay (fuerza tarjeta), 9 = todos los medios. */
  paymentMethod: number;
  label: string;
  description: string;
  subjectSuffix: string;
}

// Precios normales: base 450.000 + recargo de comisión Webpay sobre cuotas.
//   4-6 cuotas  → +6,68%  → 480.060
//   7-12 cuotas → +10,18% → 495.810
// Precios de lanzamiento (launchAmount): exactos comunicados por Paola.
export const LIDERAZGO_PLANS: Record<LiderazgoPlan, LiderazgoPlanConfig> = {
  "lid-contado": {
    amount: LIDERAZGO_REGULAR_PRICE_CLP,
    launchAmount: 360_000,
    paymentMethod: 9,
    label: "Pago contado · 1 a 3 cuotas",
    description: "Webpay (hasta 3 cuotas sin recargo), débito o transferencia",
    subjectSuffix: "",
  },
  "lid-46": {
    amount: 480_060,
    launchAmount: 384_000,
    paymentMethod: 1,
    label: "4 a 6 cuotas",
    description: "Tarjeta de crédito en 4 a 6 cuotas (incluye recargo)",
    subjectSuffix: " — 4-6 cuotas",
  },
  "lid-712": {
    amount: 495_810,
    launchAmount: 396_000,
    paymentMethod: 1,
    label: "7 a 12 cuotas",
    description: "Tarjeta de crédito en 7 a 12 cuotas (incluye recargo)",
    subjectSuffix: " — 7-12 cuotas",
  },
};

export const LIDERAZGO_PLAN_KEYS = Object.keys(
  LIDERAZGO_PLANS,
) as LiderazgoPlan[];

export function isLiderazgoPlan(value: unknown): value is LiderazgoPlan {
  return (
    typeof value === "string" &&
    (LIDERAZGO_PLAN_KEYS as string[]).includes(value)
  );
}

/** Etiqueta legible del plan para emails/recibos. Null si no es un plan de liderazgo. */
export function liderazgoPlanLabel(plan: string | null): string | null {
  if (plan && isLiderazgoPlan(plan)) {
    return LIDERAZGO_PLANS[plan].label;
  }
  return null;
}

/** ¿El código ingresado desbloquea el precio de lanzamiento? Comparación case-insensitive. */
export function isLaunchCode(code: string | null | undefined): boolean {
  return (
    typeof code === "string" &&
    code.trim().toUpperCase() === LIDERAZGO_LAUNCH_CODE
  );
}

/** Monto a cobrar para un plan, según haya código de lanzamiento válido o no. */
export function resolveLiderazgoAmount(
  plan: LiderazgoPlan,
  code: string | null | undefined,
): number {
  const config = LIDERAZGO_PLANS[plan];
  return isLaunchCode(code) ? config.launchAmount : config.amount;
}

// Schema del formulario de inscripción (mismos validadores que el Diplomado).
export const liderazgoCheckoutSchema = z.object({
  firstname: z
    .string()
    .trim()
    .min(1, "Campo requerido")
    .min(2, "Nombre muy corto")
    .max(80),
  lastname: z
    .string()
    .trim()
    .min(1, "Campo requerido")
    .min(2, "Apellido muy corto")
    .max(80),
  rut: z
    .string()
    .trim()
    .min(1, "Campo requerido")
    .refine(isValidRut, "RUT inválido")
    .transform((v) => cleanRut(v)),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Campo requerido")
    .email("Email inválido")
    .max(160),
  phone: z
    .string()
    .trim()
    .min(1, "Campo requerido")
    .min(8, "Teléfono muy corto")
    .max(20)
    .regex(/^[+\d\s()-]+$/, "Solo números, espacios, +, ( y -"),
  plan: z
    .enum(["lid-contado", "lid-46", "lid-712"])
    .default("lid-contado"),
  launchCode: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal("").transform(() => undefined)),
  ...invoiceExtension,
}).superRefine(refineInvoice);

export type LiderazgoCheckoutInput = z.input<typeof liderazgoCheckoutSchema>;
export type LiderazgoCheckoutData = z.output<typeof liderazgoCheckoutSchema>;
