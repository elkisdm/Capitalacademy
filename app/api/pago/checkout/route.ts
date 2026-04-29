import { NextResponse } from "next/server";
import { checkoutFormSchema } from "@/lib/fintoc/schema";
import {
  DIPLOMADO_PRICE_CLP,
  createDiplomadoCheckoutSession,
} from "@/lib/fintoc/checkout";
import { createFlowCheckout } from "@/lib/flow/checkout";
import { getActivePaymentProvider } from "@/lib/payments/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];
type PaymentUpdate = Database["public"]["Tables"]["payments"]["Update"];

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parsed = checkoutFormSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const provider = getActivePaymentProvider();
  const { firstname, lastname, rut, email, phone } = parsed.data;
  const supabase = createAdminClient();

  const insertPayload: PaymentInsert = {
    firstname,
    lastname,
    rut,
    email,
    phone,
    amount_clp: DIPLOMADO_PRICE_CLP,
    status: "pending",
    provider,
    ip_address:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: req.headers.get("user-agent"),
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
    const commerceOrder = `CA-${payment.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const flow = await createFlowCheckout({
      paymentId: payment.id,
      commerceOrder,
      firstname,
      lastname,
      rut,
      email,
      phone,
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

  // provider === "fintoc"
  const session = await createDiplomadoCheckoutSession({
    paymentId: payment.id,
    firstname,
    lastname,
    rut,
    email,
    phone,
  });

  if ("errorMessage" in session) {
    await supabase
      .from("payments")
      .update({
        status: "failed",
        failure_reason: session.errorMessage,
      } satisfies PaymentUpdate)
      .eq("id", payment.id);
    return NextResponse.json(
      { error: session.errorMessage },
      { status: session.status },
    );
  }

  await supabase
    .from("payments")
    .update({
      fintoc_session_id: session.checkoutSessionId,
    } satisfies PaymentUpdate)
    .eq("id", payment.id);

  return NextResponse.json({
    provider: "fintoc" as const,
    paymentId: payment.id,
    sessionToken: session.sessionToken,
    amount: session.amount,
  });
}
