import { NextResponse } from "next/server";
import { createFlowCheckout } from "@/lib/flow/checkout";
import {
  LIDERAZGO_PLANS,
  LIDERAZGO_SUBJECT,
  LIDERAZGO_LAUNCH_CODE,
  isLaunchCode,
  liderazgoCheckoutSchema,
} from "@/lib/programs/liderazgo";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import {
  createRateLimiter,
  getClientIp,
  rateLimitResponse,
} from "@/lib/rate-limit";

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

  const parsed = liderazgoCheckoutSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { firstname, lastname, rut, email, phone, plan, launchCode } =
    parsed.data;

  // El monto se computa SIEMPRE en el servidor; el cliente nunca lo envía.
  const planConfig = LIDERAZGO_PLANS[plan];
  const launchApplied = isLaunchCode(launchCode);
  const finalAmount = launchApplied
    ? planConfig.launchAmount
    : planConfig.amount;
  const discount = launchApplied
    ? planConfig.amount - planConfig.launchAmount
    : null;

  const supabase = createAdminClient();

  const insertPayload: PaymentInsert = {
    firstname,
    lastname,
    rut,
    email,
    phone,
    amount_clp: finalAmount,
    plan,
    status: "pending",
    provider: "flow",
    ip_address:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: req.headers.get("user-agent"),
    ...(launchApplied
      ? { coupon_code: LIDERAZGO_LAUNCH_CODE, discount_clp: discount }
      : {}),
  };

  const { data: payment, error: insertErr } = await supabase
    .from("payments")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertErr || !payment) {
    console.error("payments insert error (liderazgo)", insertErr);
    return NextResponse.json(
      { error: "No pudimos registrar el pago." },
      { status: 500 },
    );
  }

  const commerceOrder = `CA-LID-${payment.id.slice(0, 8)}-${Date.now().toString(36)}`;
  const flow = await createFlowCheckout({
    paymentId: payment.id,
    commerceOrder,
    firstname,
    lastname,
    rut,
    email,
    phone,
    plan,
    amountOverride: finalAmount,
    subjectOverride: `${LIDERAZGO_SUBJECT}${planConfig.subjectSuffix}`,
    paymentMethodOverride: planConfig.paymentMethod,
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

  await supabase
    .from("payments")
    .update({
      commerce_order: flow.commerceOrder,
      flow_token: flow.token,
      flow_order: flow.flowOrder,
    } satisfies PaymentUpdate)
    .eq("id", payment.id);

  return NextResponse.json({
    provider: "flow" as const,
    paymentId: payment.id,
    redirectUrl: flow.redirectUrl,
    amount: flow.amount,
  });
}
