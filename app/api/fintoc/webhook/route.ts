import { NextResponse } from "next/server";
import {
  verifyFintocSignature,
  type FintocWebhookEvent,
} from "@/lib/fintoc/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendPaymentConfirmationEmail,
  sendPaymentTeamNotification,
} from "@/lib/email/payment-confirmation";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type PaymentUpdate = Database["public"]["Tables"]["payments"]["Update"];

export async function POST(req: Request) {
  const secret = process.env.FINTOC_WEBHOOK_SECRET;
  if (!secret) {
    console.error("FINTOC_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "config" }, { status: 500 });
  }

  const tolerance = Number(
    process.env.FINTOC_WEBHOOK_TOLERANCE_SECONDS ?? "300",
  );
  const rawBody = await req.text();
  const signatureHeader =
    req.headers.get("fintoc-signature") ??
    req.headers.get("x-fintoc-signature");

  const verification = verifyFintocSignature({
    rawBody,
    signatureHeader,
    secret,
    toleranceSeconds: Number.isFinite(tolerance) ? tolerance : 300,
  });
  if (!verification.ok) {
    console.warn("fintoc webhook rejected", verification.reason);
    return NextResponse.json(
      { error: verification.reason },
      { status: 401 },
    );
  }

  let event: FintocWebhookEvent;
  try {
    event = JSON.parse(rawBody) as FintocWebhookEvent;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const obj = event.data?.object;
  const sessionId = obj?.checkout_session?.id;
  const paymentExternalId = obj?.id;
  const fintocStatus = obj?.status;

  if (!sessionId) {
    return NextResponse.json({ ok: true, ignored: "no-session-id" });
  }

  const status = mapFintocStatus(event.type, fintocStatus);
  const supabase = createAdminClient();

  // Lectura previa para detectar idempotencia: si paid_at ya existe,
  // este es un reenvío de Fintoc y NO debemos disparar emails de nuevo.
  const { data: existing } = await supabase
    .from("payments")
    .select(
      "id, firstname, lastname, email, rut, phone, amount_clp, paid_at, plan, coupon_code, discount_clp",
    )
    .eq("fintoc_session_id", sessionId)
    .single();

  const wasAlreadyPaid = Boolean(existing?.paid_at);
  const paidAtIso = new Date().toISOString();

  const update: PaymentUpdate = {
    status,
    raw_webhook: event as unknown as PaymentUpdate["raw_webhook"],
    fintoc_payment_id: paymentExternalId ?? null,
  };
  if (status === "succeeded" && !wasAlreadyPaid) {
    update.paid_at = paidAtIso;
  }

  const { error } = await supabase
    .from("payments")
    .update(update)
    .eq("fintoc_session_id", sessionId);

  if (error) {
    console.error("payments update error", error);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }

  // Notificaciones: solo en transición a succeeded (no en reenvíos).
  // Errores de email NO devuelven 500 al webhook — Fintoc reintentaría
  // y duplicaríamos pagos. Logueamos y reconciliamos manual.
  if (status === "succeeded" && !wasAlreadyPaid && existing) {
    const emailInput = {
      paymentId: existing.id,
      firstname: existing.firstname,
      lastname: existing.lastname,
      email: existing.email,
      rut: existing.rut,
      phone: existing.phone,
      amountClp: existing.amount_clp,
      paidAt: new Date(paidAtIso),
      plan: existing.plan,
      couponCode: existing.coupon_code,
      discountClp: existing.discount_clp,
    };

    const [studentResult, teamResult] = await Promise.all([
      sendPaymentConfirmationEmail(emailInput),
      sendPaymentTeamNotification(emailInput),
    ]);

    if (!studentResult.ok) {
      console.error("payment-email student failed", {
        paymentId: existing.id,
        error: studentResult.error,
      });
    }
    if (!teamResult.ok) {
      console.error("payment-email team failed", {
        paymentId: existing.id,
        error: teamResult.error,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

function mapFintocStatus(
  eventType: string | undefined,
  objStatus: string | undefined,
):
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded" {
  if (eventType?.includes("succeeded") || objStatus === "succeeded") {
    return "succeeded";
  }
  if (eventType?.includes("failed") || objStatus === "failed") {
    return "failed";
  }
  if (eventType?.includes("refunded") || objStatus === "refunded") {
    return "refunded";
  }
  if (objStatus === "processing" || objStatus === "pending") {
    return "processing";
  }
  return "pending";
}
