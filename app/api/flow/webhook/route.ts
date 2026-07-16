import { NextResponse } from "next/server";
import { fetchFlowPaymentStatus } from "@/lib/flow/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { processFlowPayment } from "@/lib/flow/process-payment";

export const runtime = "nodejs";

const SELECT_COLS =
  "id, firstname, lastname, email, rut, phone, amount_clp, paid_at, plan, coupon_code, coupon_id, discount_clp, document_type, invoice_data";

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

  const supabase = createAdminClient();

  // 1) Camino normal: por flow_token.
  const { data: existingByToken } = await supabase
    .from("payments")
    .select(SELECT_COLS)
    .eq("flow_token", token)
    .single();

  let existing = existingByToken;

  // 2) Red: por commerce_order, para el caso en que el UPDATE post-checkout no
  // alcanzó a persistir el flow_token (M10 — ver ADR-0021).
  if (!existing && result.data.commerceOrder) {
    const { data } = await supabase
      .from("payments")
      .select(SELECT_COLS)
      .eq("commerce_order", result.data.commerceOrder)
      .maybeSingle();
    existing = data;
  }

  // 3) Red adicional: por optional.payment_id. Lo enviamos nosotros al crear
  // el pago en Flow (payment/create) y viene firmado de vuelta, así que es
  // confiable. Flow devuelve `optional` como objeto, pero toleramos string JSON.
  if (!existing) {
    const raw = result.data.optional as unknown;
    let opt: Record<string, string> | null = null;
    if (typeof raw === "string") {
      try {
        opt = JSON.parse(raw);
      } catch {
        opt = null;
      }
    } else if (raw && typeof raw === "object") {
      opt = raw as Record<string, string>;
    }
    if (opt?.payment_id) {
      const { data } = await supabase
        .from("payments")
        .select(SELECT_COLS)
        .eq("id", opt.payment_id)
        .maybeSingle();
      existing = data;
    }
  }

  if (!existing) {
    console.error("flow webhook: pago no encontrado", {
      token,
      commerceOrder: result.data.commerceOrder,
      flowOrder: result.data.flowOrder,
    });
    return NextResponse.json({ ok: true, ignored: "unknown-token" });
  }

  const out = await processFlowPayment(existing, result.data, "webhook");
  if (!out.ok) {
    return NextResponse.json({ error: out.error ?? "db" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
