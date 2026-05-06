import { NextResponse } from "next/server";
import { z } from "zod";
import { PAYMENT_PLANS, isPaymentPlan } from "@/lib/flow/checkout";
import {
  applyCouponToAmount,
  couponPreview,
  lookupCoupon,
} from "@/lib/coupons/validate";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().trim().min(1).max(40),
  plan: z.string().optional(),
});

export async function POST(req: Request) {
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
    return NextResponse.json({ error: result.error }, { status: result.status });
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
