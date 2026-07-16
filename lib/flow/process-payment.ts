import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import {
  sendPaymentConfirmationEmail,
  sendPaymentTeamNotification,
} from "@/lib/email/payment-confirmation";
import { enrollBuyer } from "@/lib/classroom/enroll-from-payment";
import { PAYMENT_PLAN_KEYS } from "@/lib/flow/checkout";
import { LIDERAZGO_PLAN_KEYS } from "@/lib/programs/liderazgo";
import { mapFlowStatus, type FlowPaymentStatus } from "@/lib/flow/status";

type PaymentUpdate = Database["public"]["Tables"]["payments"]["Update"];

// Subconjunto de columnas de `payments` que necesita processFlowPayment. Tanto
// el webhook como el cron de reconciliación seleccionan (al menos) estas
// columnas antes de llamar a esta función.
export interface ExistingPaymentRow {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  rut: string;
  phone: string;
  amount_clp: number;
  paid_at: string | null;
  plan: string | null;
  coupon_code: string | null;
  coupon_id: string | null;
  discount_clp: number | null;
  document_type: string;
  invoice_data: unknown;
}

export interface ProcessResult {
  ok: boolean;
  firstSuccess: boolean;
  status: "pending" | "processing" | "succeeded" | "failed" | "refunded";
  error?: string;
}

/**
 * Aplica el estado real de Flow a un pago y, si es el PRIMER succeeded,
 * dispara emails + cupón + matrícula. Idempotente: la guarda atómica
 * `UPDATE … WHERE paid_at IS NULL` garantiza que solo un llamador (webhook
 * o cron) ejecute los side-effects, aunque corran en paralelo.
 * `source` solo se usa para logs.
 */
export async function processFlowPayment(
  payment: ExistingPaymentRow,
  flowData: FlowPaymentStatus,
  source: "webhook" | "cron",
): Promise<ProcessResult> {
  const supabase = createAdminClient();
  const status = mapFlowStatus(flowData.status);
  const paidAtIso = new Date().toISOString();

  // B1: si Flow aprobó un monto distinto al esperado, NO bloqueamos al alumno
  // (la plata ya fue tomada). Marcamos succeeded igual y dejamos rastro en
  // failure_reason para reconciliación manual offline.
  const expectedAmount = payment.amount_clp;
  const reportedAmount = flowData.amount;
  const amountMismatch =
    status === "succeeded" &&
    typeof reportedAmount === "number" &&
    reportedAmount !== expectedAmount;

  if (amountMismatch) {
    console.error(`payments ${source}: amount mismatch`, {
      paymentId: payment.id,
      expected: expectedAmount,
      reported: reportedAmount,
      flowOrder: flowData.flowOrder,
    });
  }

  const baseUpdate: PaymentUpdate = {
    status,
    raw_webhook: flowData as unknown as PaymentUpdate["raw_webhook"],
    flow_order: flowData.flowOrder ?? null,
  };
  if (amountMismatch) {
    baseUpdate.failure_reason = `amount_mismatch:expected=${expectedAmount}:reported=${reportedAmount}`;
  }

  // Para succeeded: UPDATE atómico con WHERE paid_at IS NULL.
  // Solo el primer llamador que gane la carrera establece paid_at y dispara
  // side-effects (webhook y cron pueden correr en paralelo sobre el mismo pago).
  let firstSuccess = false;
  if (status === "succeeded") {
    const { data: claimed, error } = await supabase
      .from("payments")
      .update({ ...baseUpdate, paid_at: paidAtIso })
      .eq("id", payment.id)
      .is("paid_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(`payments update error (${source})`, error);
      return { ok: false, firstSuccess: false, status, error: "db" };
    }
    firstSuccess = Boolean(claimed);
  } else {
    const { error } = await supabase
      .from("payments")
      .update(baseUpdate)
      .eq("id", payment.id);

    if (error) {
      console.error(`payments update error (${source})`, error);
      return { ok: false, firstSuccess: false, status, error: "db" };
    }
  }

  if (firstSuccess) {
    const emailInput = {
      paymentId: payment.id,
      firstname: payment.firstname,
      lastname: payment.lastname,
      email: payment.email,
      rut: payment.rut,
      phone: payment.phone,
      amountClp: payment.amount_clp,
      paidAt: new Date(paidAtIso),
      plan: payment.plan,
      couponCode: payment.coupon_code,
      discountClp: payment.discount_clp,
      documentType: payment.document_type,
      invoiceData: payment.invoice_data as Record<string, string> | null,
    };

    const [studentResult, teamResult] = await Promise.all([
      sendPaymentConfirmationEmail(emailInput),
      sendPaymentTeamNotification(emailInput),
    ]);

    if (!studentResult.ok) {
      console.error(`payment-email student failed (${source})`, {
        paymentId: payment.id,
        error: studentResult.error,
      });
    }
    if (!teamResult.ok) {
      console.error(`payment-email team failed (${source})`, {
        paymentId: payment.id,
        error: teamResult.error,
      });
    }

    // Cupón: incrementar redemptions ahora que el pago quedó confirmado
    // (primer succeeded). Nunca rompe el flujo: la plata ya fue tomada.
    if (payment.coupon_id) {
      try {
        const { error: redeemError } = await supabase.rpc(
          "increment_coupon_redemptions",
          { p_coupon_id: payment.coupon_id },
        );
        if (redeemError) {
          console.error(`coupon redeem RPC failed (${source})`, {
            paymentId: payment.id,
            couponId: payment.coupon_id,
            error: redeemError,
          });
        }
      } catch (e) {
        console.error(`coupon redeem RPC threw (${source})`, {
          paymentId: payment.id,
          couponId: payment.coupon_id,
          error: e instanceof Error ? e.message : e,
        });
      }
    }

    // Link checkout → matrícula: si el pago es del Diplomado o del Programa de
    // Liderazgo (plan en PAYMENT_PLAN_KEYS o LIDERAZGO_PLAN_KEYS), matricular
    // al comprador en el classroom de su cohorte activa y enviarle el
    // onboarding branded con link de activación. Idempotente y no rompe el
    // flujo si falla (la plata ya fue tomada; se loguea para reconciliar).
    if (
      payment.plan &&
      ((PAYMENT_PLAN_KEYS as readonly string[]).includes(payment.plan) ||
        (LIDERAZGO_PLAN_KEYS as readonly string[]).includes(payment.plan))
    ) {
      const enrollResult = await enrollBuyer({
        email: payment.email,
        firstname: payment.firstname,
        lastname: payment.lastname,
        plan: payment.plan,
      });
      if (!enrollResult.ok) {
        console.error(`enroll-on-payment failed (${source})`, {
          paymentId: payment.id,
          email: payment.email,
          plan: payment.plan,
          error: enrollResult.error,
        });
      }
    }
  }

  return { ok: true, firstSuccess, status };
}
