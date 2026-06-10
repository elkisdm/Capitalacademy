import { NextResponse } from "next/server";
import { z } from "zod";
import { checkoutFormSchema } from "@/lib/fintoc/schema";
import { createFlowCheckout } from "@/lib/flow/checkout";
import { getCobroSigningSecret, verifyCobroAmount } from "@/lib/cobro/sign";
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

// Concepto genérico mostrado en Flow y en el registro del pago.
const COBRO_CONCEPT = "Pago a Capital Academy";

// Reusa la validación de datos personales del diplomado (RUT, email, etc.) y
// agrega el monto firmado. NUNCA confiamos en `monto` sin su firma.
const cobroSchema = checkoutFormSchema
  .pick({
    firstname: true,
    lastname: true,
    rut: true,
    email: true,
    phone: true,
  })
  .extend({
    monto: z.number().int().positive().max(5_000_000),
    sig: z.string().regex(/^[0-9a-f]{64}$/i),
  });

export async function POST(req: Request) {
  const rl = limiter.check(getClientIp(req));
  if (!rl.ok) return rateLimitResponse(rl);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const parsed = cobroSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const secret = getCobroSigningSecret();
  if (!secret) {
    console.error("cobro: falta COBRO_SIGNING_SECRET");
    return NextResponse.json(
      { error: "Cobro no disponible. Falta configuración." },
      { status: 500 },
    );
  }

  const { firstname, lastname, rut, email, phone, monto, sig } = parsed.data;

  // FRONTERA DE SEGURIDAD: el monto solo es válido si su firma coincide. Así el
  // pagador no puede cambiar `monto` en la URL/body para pagar menos.
  if (!verifyCobroAmount(monto, sig, secret)) {
    return NextResponse.json(
      { error: "El monto del cobro no es válido." },
      { status: 403 },
    );
  }

  const supabase = createAdminClient();

  const insertPayload: PaymentInsert = {
    firstname,
    lastname,
    rut,
    email,
    phone,
    amount_clp: monto,
    // Un cobro genérico no tiene "plan" del diplomado. La columna tiene un CHECK
    // (payments_plan_check) que solo acepta los planes del diplomado, así que va
    // null. El cobro se distingue por el prefijo "CO-" en commerce_order.
    plan: null,
    status: "pending",
    provider: "flow",
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
    console.error("cobro: payments insert error", insertErr);
    return NextResponse.json(
      { error: "No pudimos registrar el cobro." },
      { status: 500 },
    );
  }

  const commerceOrder = `CO-${payment.id.slice(0, 8)}-${Date.now().toString(36)}`;
  const flow = await createFlowCheckout({
    paymentId: payment.id,
    commerceOrder,
    firstname,
    lastname,
    rut,
    email,
    phone,
    plan: "contado",
    amountOverride: monto,
    subjectOverride: COBRO_CONCEPT,
  });

  if ("errorMessage" in flow) {
    await supabase
      .from("payments")
      .update({
        status: "failed",
        failure_reason: flow.errorMessage,
      } satisfies PaymentUpdate)
      .eq("id", payment.id);
    return NextResponse.json({ error: flow.errorMessage }, { status: flow.status });
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
