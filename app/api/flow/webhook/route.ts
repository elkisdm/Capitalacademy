import { NextResponse } from "next/server";
import { fetchFlowPaymentStatus, mapFlowStatus } from "@/lib/flow/status";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendPaymentConfirmationEmail,
  sendPaymentTeamNotification,
} from "@/lib/email/payment-confirmation";
import { enrollDiplomadoBuyer } from "@/lib/classroom/enroll-from-payment";
import { PAYMENT_PLAN_KEYS } from "@/lib/flow/checkout";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type PaymentUpdate = Database["public"]["Tables"]["payments"]["Update"];

// Flow envía POST application/x-www-form-urlencoded con un único campo `token`.
// La autenticidad se valida indirectamente: solo Flow conoce los tokens
// emitidos al hacer payment/create, y para obtener el estado real llamamos
// /payment/getStatus firmando con nuestra secretKey. Si el token es falso,
// Flow responderá 400/401 y abortamos.
export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  let token: string | null = null;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await req.text();
    token = new URLSearchParams(body).get("token");
  } else if (contentType.includes("application/json")) {
    try {
      const json = (await req.json()) as { token?: string };
      token = json.token ?? null;
    } catch {
      token = null;
    }
  } else {
    const body = await req.text();
    token = new URLSearchParams(body).get("token");
  }

  if (!token) {
    return NextResponse.json({ error: "missing-token" }, { status: 400 });
  }

  const result = await fetchFlowPaymentStatus(token);
  if (!result.ok) {
    console.warn("flow webhook: getStatus failed", result);
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }

  const status = mapFlowStatus(result.data.status);
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("payments")
    .select(
      "id, firstname, lastname, email, rut, phone, amount_clp, paid_at, plan, coupon_code, discount_clp",
    )
    .eq("flow_token", token)
    .single();

  if (!existing) {
    console.warn("flow webhook: payment not found for token", token);
    return NextResponse.json({ ok: true, ignored: "unknown-token" });
  }

  const paidAtIso = new Date().toISOString();

  // B1: si Flow aprobó un monto distinto al esperado, NO bloqueamos al alumno
  // (la plata ya fue tomada). Marcamos succeeded igual y dejamos rastro en
  // failure_reason para reconciliación manual offline.
  const expectedAmount = existing.amount_clp;
  const reportedAmount = result.data.amount;
  const amountMismatch =
    status === "succeeded" &&
    typeof reportedAmount === "number" &&
    reportedAmount !== expectedAmount;

  if (amountMismatch) {
    console.error("flow webhook: amount mismatch", {
      paymentId: existing.id,
      expected: expectedAmount,
      reported: reportedAmount,
      flowOrder: result.data.flowOrder,
    });
  }

  const baseUpdate: PaymentUpdate = {
    status,
    raw_webhook: result.data as unknown as PaymentUpdate["raw_webhook"],
    flow_order: result.data.flowOrder ?? null,
  };
  if (amountMismatch) {
    baseUpdate.failure_reason = `amount_mismatch:expected=${expectedAmount}:reported=${reportedAmount}`;
  }

  // Para succeeded: UPDATE atómico con WHERE paid_at IS NULL.
  // Solo el primer request que gane la carrera establece paid_at y dispara emails.
  // Para otros estados: UPDATE normal (no hay side-effects que deduplicar).
  let firstSuccess = false;
  if (status === "succeeded") {
    const { data: claimed, error } = await supabase
      .from("payments")
      .update({ ...baseUpdate, paid_at: paidAtIso })
      .eq("flow_token", token)
      .is("paid_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("payments update error (flow)", error);
      return NextResponse.json({ error: "db" }, { status: 500 });
    }
    firstSuccess = Boolean(claimed);
  } else {
    const { error } = await supabase
      .from("payments")
      .update(baseUpdate)
      .eq("flow_token", token);

    if (error) {
      console.error("payments update error (flow)", error);
      return NextResponse.json({ error: "db" }, { status: 500 });
    }
  }

  if (firstSuccess) {
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
      console.error("payment-email student failed (flow)", {
        paymentId: existing.id,
        error: studentResult.error,
      });
    }
    if (!teamResult.ok) {
      console.error("payment-email team failed (flow)", {
        paymentId: existing.id,
        error: teamResult.error,
      });
    }

    // Link checkout → matrícula: si el pago es del Diplomado (plan en
    // PAYMENT_PLAN_KEYS), matricular al comprador en el classroom y
    // enviarle el onboarding con link de activación. Idempotente y no rompe el
    // webhook si falla (la plata ya fue tomada; se loguea para reconciliar).
    if (existing.plan && (PAYMENT_PLAN_KEYS as readonly string[]).includes(existing.plan)) {
      const enrollResult = await enrollDiplomadoBuyer({
        email: existing.email,
        firstname: existing.firstname,
        lastname: existing.lastname,
      });
      if (!enrollResult.ok) {
        console.error("diplomado enroll-on-payment failed (flow)", {
          paymentId: existing.id,
          email: existing.email,
          error: enrollResult.error,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
