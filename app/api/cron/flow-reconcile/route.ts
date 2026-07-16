import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCron } from "@/lib/api/cron-auth";
import {
  fetchFlowPaymentStatus,
  fetchFlowPaymentStatusByCommerceId,
  mapFlowStatus,
} from "@/lib/flow/status";
import { processFlowPayment } from "@/lib/flow/process-payment";

export const runtime = "nodejs";
export const maxDuration = 60;
// Evita que Next intente cachear/estatizar la ruta del cron.
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET/POST  /api/cron/flow-reconcile
//   Red de seguridad para M10: pagos cobrados por Flow cuyo webhook nunca
//   llegó (o llegó y no encontró el pago) quedan `pending` para siempre sin
//   esto. Cada corrida consulta contra la API de Flow (read-only) los pagos
//   `pending` de Flow dentro de una ventana [15 min, 30 días]:
//     - menos de 15 min: margen para no pisar al webhook en vuelo.
//     - más de 30 días: se asume abandono de carrito y se auto-limpia (no se
//       reconsulta para siempre); los huérfanos más viejos se reparan a mano.
//   Preferimos reconciliar por commerce_order (la llave garantizada por el
//   INSERT, ver ADR-0021) y caemos a flow_token si por algún motivo no hay
//   commerce_order. Reusa processFlowPayment (mismo helper que el webhook) y
//   su guarda atómica `UPDATE … WHERE paid_at IS NULL`, así que si el webhook
//   y este cron corren en paralelo sobre el mismo pago no se duplican emails
//   ni matrículas.
// ---------------------------------------------------------------------------

const WINDOW_MIN_MINUTES = 15;
const WINDOW_MAX_DAYS = 30;
const MAX_PER_RUN = 100;

const SELECT_COLS =
  "id, firstname, lastname, email, rut, phone, amount_clp, paid_at, plan, coupon_code, coupon_id, discount_clp, document_type, invoice_data, flow_token, commerce_order";

export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const now = Date.now();
  const upper = new Date(now - WINDOW_MIN_MINUTES * 60_000).toISOString();
  const lower = new Date(now - WINDOW_MAX_DAYS * 86_400_000).toISOString();

  const admin = createAdminClient();
  const { data: candidates, error } = await admin
    .from("payments")
    .select(SELECT_COLS)
    .eq("status", "pending")
    .eq("provider", "flow")
    .lte("created_at", upper)
    .gte("created_at", lower)
    // Prioriza los pagos más nuevos: si hay más de MAX_PER_RUN pendientes en
    // la ventana, son los recuperables (los viejos ya perdieron la carrera en
    // corridas previas); ver ADR-0021 sobre el límite por corrida.
    .order("created_at", { ascending: false })
    .limit(MAX_PER_RUN);

  if (error) {
    console.error("flow-reconcile query error", error);
    return NextResponse.json({ error: "db" }, { status: 500 });
  }

  let checked = 0;
  let recovered = 0;
  let closed = 0;

  for (const p of candidates ?? []) {
    const res = p.commerce_order
      ? await fetchFlowPaymentStatusByCommerceId(p.commerce_order)
      : p.flow_token
        ? await fetchFlowPaymentStatus(p.flow_token)
        : null;
    if (!res) continue;

    checked++;
    if (!res.ok) {
      console.warn("flow-reconcile: getStatus falló", {
        paymentId: p.id,
        reason: res.reason,
      });
      continue;
    }

    const mapped = mapFlowStatus(res.data.status);
    if (mapped === "pending") continue; // aún no paga: no tocar

    const out = await processFlowPayment(p, res.data, "cron");
    if (mapped === "succeeded" && out.firstSuccess) {
      recovered++;
      // console.error a propósito: un pago recuperado por el cron significa
      // que el webhook falló, y eso debe ser visible en los logs de Netlify
      // aunque el flujo se haya auto-reparado.
      console.error("flow-reconcile: PAGO RECUPERADO (webhook perdido)", {
        paymentId: p.id,
        commerceOrder: p.commerce_order,
        amount: p.amount_clp,
      });
    } else if (mapped !== "succeeded") {
      closed++;
    }
  }

  return NextResponse.json({ ok: true, checked, recovered, closed });
}

// Algunos schedulers invocan por GET; otros prefieren POST.
export const POST = GET;
