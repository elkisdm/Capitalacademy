import { signFlowParams } from "./sign";

export const DIPLOMADO_PRICE_CLP = 250_000;

export const FLOW_API_BASE =
  process.env.FLOW_API_BASE ?? "https://www.flow.cl/api";

export interface FlowCheckoutInput {
  paymentId: string;
  commerceOrder: string;
  firstname: string;
  lastname: string;
  rut: string;
  email: string;
  phone: string;
}

export type FlowCheckoutResult =
  | {
      url: string;
      token: string;
      flowOrder: number;
      redirectUrl: string;
      amount: number;
      commerceOrder: string;
    }
  | { errorMessage: string; status: number };

interface FlowPaymentCreateResponse {
  url?: string;
  token?: string;
  flowOrder?: number;
}

export async function createFlowCheckout(
  input: FlowCheckoutInput,
): Promise<FlowCheckoutResult> {
  const apiKey = process.env.FLOW_API_KEY;
  const secretKey = process.env.FLOW_SECRET_KEY;
  if (!apiKey || !secretKey) {
    return {
      errorMessage: "Falta configurar FLOW_API_KEY/FLOW_SECRET_KEY.",
      status: 500,
    };
  }

  const baseAppUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://capitalacademy.cl";

  const optional = JSON.stringify({
    rut: input.rut,
    nombre: `${input.firstname} ${input.lastname}`.trim(),
    phone: input.phone,
    payment_id: input.paymentId,
  });

  const params = {
    apiKey,
    commerceOrder: input.commerceOrder,
    subject: "Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria",
    currency: "CLP",
    amount: DIPLOMADO_PRICE_CLP,
    email: input.email,
    paymentMethod: 9,
    urlConfirmation: `${baseAppUrl}/api/flow/webhook`,
    urlReturn: `${baseAppUrl}/pago/resultado`,
    optional,
  };

  const { signature, clean } = signFlowParams(params, secretKey);
  const body = new URLSearchParams({ ...clean, s: signature });

  const res = await fetch(`${FLOW_API_BASE}/payment/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Flow payment/create error:", res.status, text);
    return {
      errorMessage: "No pudimos iniciar el pago en Flow.",
      status: 502,
    };
  }

  const data = (await res.json()) as FlowPaymentCreateResponse;
  if (!data.url || !data.token || !data.flowOrder) {
    console.error("Flow payment/create incomplete response", data);
    return {
      errorMessage: "Respuesta incompleta de Flow.",
      status: 502,
    };
  }

  return {
    url: data.url,
    token: data.token,
    flowOrder: data.flowOrder,
    redirectUrl: `${data.url}?token=${data.token}`,
    amount: DIPLOMADO_PRICE_CLP,
    commerceOrder: input.commerceOrder,
  };
}
