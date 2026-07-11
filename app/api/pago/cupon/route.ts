import { NextResponse } from "next/server";
import { z } from "zod";
import { PAYMENT_PLANS, isPaymentPlan } from "@/lib/flow/checkout";
import {
  applyCouponToAmount,
  couponPreview,
  lookupCoupon,
} from "@/lib/coupons/validate";
import { createRateLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const limiter = createRateLimiter({ limit: 5, windowSeconds: 300 });

const bodySchema = z.object({
  code: z.string().trim().min(1).max(40),
  plan: z.string().optional(),
});

// Mensaje uniforme para toda validación fallida (código inexistente, expirado,
// agotado o inactivo): que no distinga el motivo evita que alguien enumere
// códigos válidos probando cuáles devuelven un error distinto.
const INVALID_COUPON_MESSAGE = "Cupón no válido.";

export async function POST(req: Request) {
  const rl = limiter.check(getClientIp(req));
  if (!rl.ok) return rateLimitResponse(rl);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación fallida" }, { status: 422 });
  }

  const result = await lookupCoupon(parsed.data.code);
  if (!result.ok) {
    // status 500 (error de servidor) se preserva; el resto se uniforma a 404
    // con el mismo mensaje para no filtrar si el código existe.
    const status = result.status === 500 ? 500 : 404;
    const error = result.status === 500 ? result.error : INVALID_COUPON_MESSAGE;
    return NextResponse.json({ error }, { status });
  }

  const planKey = isPaymentPlan(parsed.data.plan)
    ? parsed.data.plan
    : "contado";
  const baseAmount = PAYMENT_PLANS[planKey].amount;
  const applied = applyCouponToAmount(result.coupon, baseAmount);

  return NextResponse.json({
    coupon: couponPreview(result.coupon),
    plan: planKey,
    baseAmount,
    discountClp: applied.discountClp,
    finalAmountClp: applied.finalAmountClp,
  });
}
