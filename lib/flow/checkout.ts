import { signFlowParams } from "./sign";

export const DIPLOMADO_PRICE_CLP = 250_000;

export const FLOW_API_BASE =
  process.env.FLOW_API_BASE ?? "https://www.flow.cl/api";

export type PaymentPlan = "contado" | "webpay-6" | "webpay-12";

// Montos finales según plan (los de tarjeta ya incluyen el recargo
// que cubre la comisión de Webpay; el pagador asume el costo).
// paymentMethod de Flow: 1 = Webpay, 9 = todos los medios.
export const PAYMENT_PLANS: Record<
  PaymentPlan,
  {
    amount: number;
    paymentMethod: number;
    label: string;
    description: string;
    subjectSuffix: string;
  }
> = {
  contado: {
    amount: DIPLOMADO_PRICE_CLP,
    paymentMethod: 9,
    label: "Pago contado",
    description: "Webpay 1 cuota, débito o transferencia",
    subjectSuffix: "",
  },
  "webpay-6": {
    amount: 266_700,
    paymentMethod: 1,
    label: "Webpay 6 cuotas",
    description: "Tarjeta de crédito en 6 cuotas (incluye recargo)",
    subjectSuffix: " — 6 cuotas",
  },
  "webpay-12": {
    amount: 275_450,
    paymentMethod: 1,
    label: "Webpay 12 cuotas",
    description: "Tarjeta de crédito en 12 cuotas (incluye recargo)",
    subjectSuffix: " — 12 cuotas",
  },
};

export const PAYMENT_PLAN_KEYS = Object.keys(PAYMENT_PLANS) as PaymentPlan[];

export function isPaymentPlan(value: unknown): value is PaymentPlan {
  return (
    typeof value === "string" &&
    (PAYMENT_PLAN_KEYS as string[]).includes(value)
  );
}

export interface FlowCheckoutInput {
  paymentId: string;
  commerceOrder: string;
  firstname: string;
  lastname: string;
  rut: string;
  email: string;
  phone: string;
  plan: PaymentPlan;
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

  // Flow rechaza URLs http/localhost en urlConfirmation y urlReturn (1603).
  // Si la env var no es https público válido, caemos al dominio de producción.
  const candidate = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const baseAppUrl =
    candidate && candidate.startsWith("https://") ? candidate : "https://capitalacademy.cl";

  const planConfig = PAYMENT_PLANS[input.plan];

  const optional = JSON.stringify({
    rut: input.rut,
    nombre: `${input.firstname} ${input.lastname}`.trim(),
    phone: input.phone,
    payment_id: input.paymentId,
    plan: input.plan,
  });

  const params = {
    apiKey,
    commerceOrder: input.commerceOrder,
    subject: `Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria${planConfig.subjectSuffix}`,
    currency: "CLP",
    amount: planConfig.amount,
    email: input.email,
    paymentMethod: planConfig.paymentMethod,
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
    amount: planConfig.amount,
    commerceOrder: input.commerceOrder,
  };
}
