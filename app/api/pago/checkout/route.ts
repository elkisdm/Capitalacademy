import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { diplomadoCheckoutSchema } from "@/lib/fintoc/schema";
import { PAYMENT_PLANS, createFlowCheckout } from "@/lib/flow/checkout";
import { getActivePaymentProvider } from "@/lib/payments/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { applyCouponToAmount, lookupCoupon } from "@/lib/coupons/validate";
import { createRateLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const limiter = createRateLimiter({ limit: 5, windowSeconds: 300 });

type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];
type PaymentUpdate = Database["public"]["Tables"]["payments"]["Update"];

export async function POST(req: Request) {
  const rl = limiter.check(getClientIp(req));
  if (!rl.ok) return rateLimitResponse(rl);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parsed = diplomadoCheckoutSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const provider = getActivePaymentProvider();
  const {
    firstname,
    lastname,
    rut,
    email,
    phone,
    plan,
    couponCode,
    documentType,
    invoice,
  } = parsed.data;

  const effectivePlan = plan;
  const baseAmount = PAYMENT_PLANS[effectivePlan].amount;

  let finalAmount = baseAmount;
  let appliedCouponId: string | null = null;
  let appliedCouponCode: string | null = null;
  let appliedDiscount: number | null = null;

  if (couponCode) {
    const coupon = await lookupCoupon(couponCode);
    if (!coupon.ok) {
      return NextResponse.json(
        { error: coupon.error },
        { status: coupon.status },
      );
    }
    const applied = applyCouponToAmount(coupon.coupon, baseAmount);
    finalAmount = applied.finalAmountClp;
    appliedCouponId = applied.id;
    appliedCouponCode = applied.code;
    appliedDiscount = applied.discountClp;
  }

  const supabase = createAdminClient();

  // commerce_order se genera ANTES del insert (que sí captura errores) para
  // que la llave de reconciliación exista en la DB antes de que Flow pueda
  // cobrar. El UPDATE posterior de flow_token/flow_order es best-effort: si
  // falla, el cron de reconciliación (app/api/cron/flow-reconcile) igual
  // recupera el pago por commerce_order (ver ADR-0021 / M10).
  const paymentId = crypto.randomUUID();
  const commerceOrder = `CA-${paymentId.slice(0, 8)}-${Date.now().toString(36)}`;

  const insertPayload: PaymentInsert = {
    id: paymentId,
    commerce_order: commerceOrder,
    firstname,
    lastname,
    rut,
    email,
    phone,
    amount_clp: finalAmount,
    plan: effectivePlan,
    status: "pending",
    provider,
    document_type: documentType,
    invoice_data: documentType === "factura" ? invoice : null,
    ip_address:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: req.headers.get("user-agent"),
    ...(appliedCouponId
      ? {
          coupon_id: appliedCouponId,
          coupon_code: appliedCouponCode,
          discount_clp: appliedDiscount,
        }
      : {}),
  };

  const { data: payment, error: insertErr } = await supabase
    .from("payments")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertErr || !payment) {
    console.error("payments insert error", insertErr);
    return NextResponse.json(
      { error: "No pudimos registrar el pago." },
      { status: 500 },
    );
  }

  if (provider === "flow") {
    const flow = await createFlowCheckout({
      paymentId: payment.id,
      commerceOrder,
      firstname,
      lastname,
      rut,
      email,
      phone,
      plan: effectivePlan,
      amountOverride: appliedCouponId ? finalAmount : undefined,
    });

    if ("errorMessage" in flow) {
      await supabase
        .from("payments")
        .update({
          status: "failed",
          failure_reason: flow.errorMessage,
        } satisfies PaymentUpdate)
        .eq("id", payment.id);
      return NextResponse.json(
        { error: flow.errorMessage },
        { status: flow.status },
      );
    }

    const { error: tokenErr } = await supabase
      .from("payments")
      .update({
        flow_token: flow.token,
        flow_order: flow.flowOrder,
      } satisfies PaymentUpdate)
      .eq("id", payment.id);

    if (tokenErr) {
      console.error("payments flow_token update error (recuperable por cron)", {
        paymentId: payment.id,
        commerceOrder,
        error: tokenErr,
      });
    }

    return NextResponse.json({
      provider: "flow" as const,
      paymentId: payment.id,
      redirectUrl: flow.redirectUrl,
      amount: flow.amount,
    });
  }
}
