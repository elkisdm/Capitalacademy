import { NextResponse } from "next/server";
import { fetchFlowPaymentStatus, mapFlowStatus } from "@/lib/flow/status";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendPaymentConfirmationEmail,
  sendPaymentTeamNotification,
} from "@/lib/email/payment-confirmation";
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
      "id, firstname, lastname, email, rut, phone, amount_clp, paid_at, plan",
    )
    .eq("flow_token", token)
    .single();

  if (!existing) {
    console.warn("flow webhook: payment not found for token", token);
    return NextResponse.json({ ok: true, ignored: "unknown-token" });
  }

  const wasAlreadyPaid = Boolean(existing.paid_at);
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

  const update: PaymentUpdate = {
    status,
    raw_webhook: result.data as unknown as PaymentUpdate["raw_webhook"],
    flow_order: result.data.flowOrder ?? null,
  };
  if (status === "succeeded" && !wasAlreadyPaid) {
    update.paid_at = paidAtIso;
  }
  if (amountMismatch) {
    update.failure_reason = `amount_mismatch:expected=${expectedAmount}:reported=${reportedAmount}`;
  }

  const { error } = await supabase
    .from("payments")
    .update(update)
    .eq("flow_token", token);

  if (error) {
    console.error("payments update error (flow)", error);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }

  if (status === "succeeded" && !wasAlreadyPaid) {
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
  }

  return NextResponse.json({ ok: true });
}
