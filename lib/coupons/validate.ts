import { createAdminClient } from "@/lib/supabase/admin";
import type { AppliedCoupon, CouponPreview, CouponRow } from "./types";

export type CouponLookupResult =
  | { ok: true; coupon: CouponRow }
  | { ok: false; error: string; status: number };

export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Busca el cupón por código y verifica que esté vigente, activo y con cupos.
 * NO incrementa redemptions: eso lo hace el webhook de Flow (RPC
 * `increment_coupon_redemptions`) al confirmarse el pago por primera vez.
 */
export async function lookupCoupon(rawCode: string): Promise<CouponLookupResult> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, error: "Código vacío.", status: 400 };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("coupons")
    .select(
      "id, code, percent_off, label, valid_from, valid_until, max_redemptions, redemptions, active",
    )
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("coupons lookup error", error);
    return { ok: false, error: "No pudimos validar el cupón.", status: 500 };
  }
  if (!data) return { ok: false, error: "Cupón no válido.", status: 404 };

  const coupon: CouponRow = data;
  if (!coupon.active) return { ok: false, error: "Cupón no disponible.", status: 410 };

  const now = Date.now();
  if (coupon.valid_from && Date.parse(coupon.valid_from) > now) {
    return { ok: false, error: "Cupón aún no vigente.", status: 410 };
  }
  if (coupon.valid_until && Date.parse(coupon.valid_until) < now) {
    return { ok: false, error: "Cupón expirado.", status: 410 };
  }
  if (
    coupon.max_redemptions !== null &&
    coupon.redemptions >= coupon.max_redemptions
  ) {
    return { ok: false, error: "Cupón agotado.", status: 410 };
  }

  return { ok: true, coupon };
}

export function couponPreview(coupon: CouponRow): CouponPreview {
  return {
    id: coupon.id,
    code: coupon.code,
    percentOff: coupon.percent_off,
    label: coupon.label,
  };
}

/**
 * Calcula el descuento en pesos chilenos sobre el monto entregado, redondeando
 * a entero (Flow rechaza decimales). Usa Math.round para no regalar cifras al
 * usuario ni cobrar de menos al comercio.
 */
export function applyCouponToAmount(
  coupon: CouponRow,
  amountClp: number,
): AppliedCoupon {
  const discount = Math.round((amountClp * coupon.percent_off) / 100);
  const finalAmount = Math.max(0, amountClp - discount);
  return {
    id: coupon.id,
    code: coupon.code,
    percentOff: coupon.percent_off,
    discountClp: discount,
    finalAmountClp: finalAmount,
  };
}
