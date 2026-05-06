/**
 * Fuente única del precio base del Diplomado en CLP.
 * Cualquier cambio de tarifa se hace acá; los recargos por cuotas viven
 * en `lib/flow/checkout.ts` (PAYMENT_PLANS) porque dependen de Flow.
 */
export const DIPLOMADO_PRICE_CLP = 500_000;
