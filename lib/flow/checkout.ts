import { signFlowParams } from "./sign";
import { DIPLOMADO_PRICE_CLP } from "@/lib/pricing";

export { DIPLOMADO_PRICE_CLP };

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
    amount: 533_400,
    paymentMethod: 1,
    label: "Webpay 6 cuotas",
    description: "Tarjeta de crédito en 6 cuotas (incluye recargo)",
    subjectSuffix: " — 6 cuotas",
  },
  "webpay-12": {
    amount: 550_900,
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
  /** Clave de plan. Acepta planes del Diplomado o de otros programas (string libre). */
  plan: string;
  amountOverride?: number;
  /** Reemplaza el subject (por defecto, el del Diplomado). Para cobros genéricos / otros programas. */
  subjectOverride?: string;
  /** Reemplaza el paymentMethod de Flow. Necesario para planes fuera de PAYMENT_PLANS. */
  paymentMethodOverride?: number;
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
    console.error("Flow sin credenciales: falta FLOW_API_KEY/FLOW_SECRET_KEY");
    return {
      errorMessage: "No pudimos iniciar el pago en este momento. Intenta más tarde.",
      status: 500,
    };
  }

  // Flow rechaza URLs http/localhost en urlConfirmation y urlReturn (1603).
  // Si la env var no es https público válido, caemos al dominio de producción.
  const candidate = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const baseAppUrl =
    candidate && candidate.startsWith("https://") ? candidate : "https://capitalacademy.cl";

  // planConfig solo existe para los planes del Diplomado. Para otros programas
  // (liderazgo, cobros genéricos) llega undefined y se usan los overrides.
  const planConfig = PAYMENT_PLANS[input.plan as PaymentPlan] as
    | (typeof PAYMENT_PLANS)[PaymentPlan]
    | undefined;
  const chargeAmount = input.amountOverride ?? planConfig?.amount ?? 0;

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
    subject:
      input.subjectOverride ??
      `Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria${planConfig?.subjectSuffix ?? ""}`,
    currency: "CLP",
    amount: chargeAmount,
    email: input.email,
    paymentMethod: input.paymentMethodOverride ?? planConfig?.paymentMethod ?? 9,
    urlConfirmation: `${baseAppUrl}/api/flow/webhook`,
    urlReturn: `${baseAppUrl}/pago/resultado`,
    optional,
  };

  const { signature, clean } = signFlowParams(params, secretKey);
  const body = new URLSearchParams({ ...clean, s: signature });

  let res: Response;
  try {
    res = await fetch(`${FLOW_API_BASE}/payment/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
  } catch (err) {
    console.error("Flow payment/create network error:", err);
    return {
      errorMessage: "No pudimos iniciar el pago en Flow.",
      status: 502,
    };
  }

  if (!res.ok) {
    const text = await res.text();
    console.error("Flow payment/create error:", res.status, text);
    return {
      errorMessage: "No pudimos iniciar el pago en Flow.",
      status: 502,
    };
  }

  let data: FlowPaymentCreateResponse;
  try {
    data = (await res.json()) as FlowPaymentCreateResponse;
  } catch {
    const text = await res.text().catch(() => "");
    console.error("Flow payment/create respuesta no-JSON", res.status, text.slice(0, 500));
    return {
      errorMessage: "Respuesta incompleta de Flow.",
      status: 502,
    };
  }
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
    amount: chargeAmount,
    commerceOrder: input.commerceOrder,
  };
}
