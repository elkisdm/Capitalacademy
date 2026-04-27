export const DIPLOMADO_PRICE_CLP = 250_000;

const FINTOC_API_BASE_URLS = [
  "https://api.fintoc.com/v2",
  "https://api.fintoc.com/v1",
] as const;

interface FintocCheckoutSessionResponse {
  id?: string;
  session_token?: string | null;
}

export interface CheckoutSessionInput {
  paymentId: string;
  firstname: string;
  lastname: string;
  rut: string;
  email: string;
  phone: string;
}

export type CheckoutSessionResult =
  | {
      sessionToken: string;
      checkoutSessionId: string;
      amount: number;
    }
  | { errorMessage: string; status: number };

/**
 * Crea una sesión de checkout embebido en Fintoc para el ingreso al
 * Diplomado de Capital Academy. Monto fijo en CLP.
 */
export async function createDiplomadoCheckoutSession(
  input: CheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  const fintocSecretKey = process.env.FINTOC_SECRET_KEY;
  if (!fintocSecretKey) {
    return { errorMessage: "Falta configurar FINTOC_SECRET_KEY.", status: 500 };
  }

  const checkoutPayload = {
    amount: DIPLOMADO_PRICE_CLP,
    currency: "CLP",
    customer: {
      name: `${input.firstname} ${input.lastname}`.trim(),
      email: input.email,
      metadata: { phone: input.phone, rut: input.rut },
    },
    metadata: {
      flow: "diplomado-ingreso",
      payment_id: input.paymentId,
      email: input.email,
      rut: input.rut,
    },
  };

  const authHeaders = [fintocSecretKey, `Bearer ${fintocSecretKey}`] as const;
  let lastErrorText = "unknown";

  for (const baseUrl of FINTOC_API_BASE_URLS) {
    for (const authorization of authHeaders) {
      const checkoutRes = await fetch(`${baseUrl}/checkout_sessions`, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(checkoutPayload),
        cache: "no-store",
      });

      if (!checkoutRes.ok) {
        const errorText = await checkoutRes.text();
        lastErrorText = `base=${baseUrl} status=${checkoutRes.status} body=${errorText}`;
        continue;
      }

      const checkout =
        (await checkoutRes.json()) as FintocCheckoutSessionResponse;
      const sessionToken = checkout.session_token;
      const checkoutSessionId = checkout.id;

      if (!sessionToken || !checkoutSessionId) {
        lastErrorText = `base=${baseUrl} missing session_token/id`;
        continue;
      }

      return {
        sessionToken,
        checkoutSessionId,
        amount: DIPLOMADO_PRICE_CLP,
      };
    }
  }

  console.error("Fintoc checkout error:", lastErrorText);
  return {
    errorMessage: "No pudimos iniciar el pago. Revisa configuración de Fintoc.",
    status: 502,
  };
}
