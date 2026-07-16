import { signFlowParams } from "./sign";
import { FLOW_API_BASE } from "./checkout";

// Estados de pago de Flow:
//   1 = pendiente, 2 = pagada, 3 = rechazada, 4 = anulada.
export type FlowPaymentStatusCode = 1 | 2 | 3 | 4;

export interface FlowPaymentStatus {
  flowOrder: number;
  commerceOrder: string;
  requestDate: string;
  status: FlowPaymentStatusCode;
  subject: string;
  currency: string;
  amount: number;
  payer: string;
  optional?: Record<string, string>;
  pending_info?: { media?: string; date?: string };
  paymentData?: {
    date?: string;
    media?: string;
    amount?: number;
    currency?: string;
    fee?: number;
    balance?: number;
    transferDate?: string;
  };
  merchantId?: string;
}

export type FetchFlowStatusResult =
  | { ok: true; data: FlowPaymentStatus }
  | { ok: false; status: number; reason: string };

export async function fetchFlowPaymentStatus(
  token: string,
): Promise<FetchFlowStatusResult> {
  const apiKey = process.env.FLOW_API_KEY;
  const secretKey = process.env.FLOW_SECRET_KEY;
  if (!apiKey || !secretKey) {
    return { ok: false, status: 500, reason: "missing-flow-keys" };
  }

  const { signature, clean } = signFlowParams(
    { apiKey, token },
    secretKey,
  );
  const qs = new URLSearchParams({ ...clean, s: signature }).toString();
  const res = await fetch(`${FLOW_API_BASE}/payment/getStatus?${qs}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Flow getStatus error", res.status, body);
    return { ok: false, status: res.status, reason: "flow-api-error" };
  }

  const data = (await res.json()) as FlowPaymentStatus;
  return { ok: true, data };
}

/**
 * Igual que fetchFlowPaymentStatus pero por commerceOrder. Necesario para
 * reconciliar pagos cuyo flow_token no alcanzó a persistirse (M10). Devuelve
 * el MISMO shape que getStatus salvo `token`, que Flow no incluye en esta
 * respuesta (verificado contra la API real).
 */
export async function fetchFlowPaymentStatusByCommerceId(
  commerceId: string,
): Promise<FetchFlowStatusResult> {
  const apiKey = process.env.FLOW_API_KEY;
  const secretKey = process.env.FLOW_SECRET_KEY;
  if (!apiKey || !secretKey) {
    return { ok: false, status: 500, reason: "missing-flow-keys" };
  }

  const { signature, clean } = signFlowParams(
    { apiKey, commerceId },
    secretKey,
  );
  const qs = new URLSearchParams({ ...clean, s: signature }).toString();
  const res = await fetch(`${FLOW_API_BASE}/payment/getStatusByCommerceId?${qs}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Flow getStatusByCommerceId error", res.status, body);
    return { ok: false, status: res.status, reason: "flow-api-error" };
  }

  const data = (await res.json()) as FlowPaymentStatus;
  return { ok: true, data };
}

export function mapFlowStatus(
  code: FlowPaymentStatusCode,
):
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "refunded" {
  switch (code) {
    case 2:
      return "succeeded";
    case 3:
      return "failed";
    case 4:
      return "refunded";
    case 1:
    default:
      return "pending";
  }
}
