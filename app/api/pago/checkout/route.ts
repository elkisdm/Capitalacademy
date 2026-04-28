import { NextResponse } from "next/server";
import { checkoutFormSchema } from "@/lib/fintoc/schema";
import {
  DIPLOMADO_PRICE_CLP,
  createDiplomadoCheckoutSession,
} from "@/lib/fintoc/checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];

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
      })
      .eq("id", payment.id);
    return NextResponse.json(
      { error: session.errorMessage },
      { status: session.status },
    );
  }

  await supabase
    .from("payments")
    .update({ fintoc_session_id: session.checkoutSessionId })
    .eq("id", payment.id);

  return NextResponse.json({
    paymentId: payment.id,
    sessionToken: session.sessionToken,
    amount: session.amount,
  });
}
