import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signFlowParams } from "@/lib/flow/sign";
import {
  createFlowCheckout,
  isPaymentPlan,
  PAYMENT_PLANS,
  PAYMENT_PLAN_KEYS,
  DIPLOMADO_PRICE_CLP,
  type FlowCheckoutInput,
} from "@/lib/flow/checkout";

const ORIGINAL_ENV = { ...process.env };

function setFlowEnv(opts: {
  apiKey?: string;
  secretKey?: string;
  appUrl?: string;
}) {
  if (opts.apiKey === undefined) delete process.env.FLOW_API_KEY;
  else process.env.FLOW_API_KEY = opts.apiKey;

  if (opts.secretKey === undefined) delete process.env.FLOW_SECRET_KEY;
  else process.env.FLOW_SECRET_KEY = opts.secretKey;

  if (opts.appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = opts.appUrl;
}

const baseInput: FlowCheckoutInput = {
  paymentId: "pay-1",
  commerceOrder: "order-1",
  firstname: "Nombre",
  lastname: "Apellido",
  rut: "11.111.111-1",
  email: "alumno@test.com",
  phone: "+56911111111",
  plan: "contado",
};

describe("createFlowCheckout", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    consoleErrorSpy.mockRestore();
  });

  it("sin FLOW_API_KEY/FLOW_SECRET_KEY -> error 500 neutro sin llamar a fetch", async () => {
    setFlowEnv({});
    const result = await createFlowCheckout(baseInput);

    expect(result).toEqual({
      errorMessage: "No pudimos iniciar el pago en este momento. Intenta más tarde.",
      status: 500,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Flow sin credenciales: falta FLOW_API_KEY/FLOW_SECRET_KEY",
    );
  });

  it("plan del Diplomado (contado) -> arma subject, amount y paymentMethod desde PAYMENT_PLANS", async () => {
    setFlowEnv({ apiKey: "api-key", secretKey: "secret-key" });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://flow.cl/pay", token: "tok-1", flowOrder: 111 }),
    });

    const result = await createFlowCheckout(baseInput);

    expect(result).toEqual({
      url: "https://flow.cl/pay",
      token: "tok-1",
      flowOrder: 111,
      redirectUrl: "https://flow.cl/pay?token=tok-1",
      amount: DIPLOMADO_PRICE_CLP,
      commerceOrder: "order-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://www.flow.cl/api/payment/create");
    expect(calledInit).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cache: "no-store",
    });

    const sentBody = calledInit.body as URLSearchParams;
    expect(sentBody.get("subject")).toBe(
      "Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria",
    );
    expect(sentBody.get("amount")).toBe(String(DIPLOMADO_PRICE_CLP));
    expect(sentBody.get("paymentMethod")).toBe("9");
    expect(sentBody.get("commerceOrder")).toBe("order-1");
    expect(sentBody.get("urlConfirmation")).toBe(
      "https://capitalacademy.cl/api/flow/webhook",
    );
    expect(sentBody.get("urlReturn")).toBe(
      "https://capitalacademy.cl/pago/resultado",
    );

    const optional = JSON.parse(sentBody.get("optional") ?? "{}");
    expect(optional).toEqual({
      rut: baseInput.rut,
      nombre: "Nombre Apellido",
      phone: baseInput.phone,
      payment_id: baseInput.paymentId,
      plan: "contado",
    });

    // La firma debe corresponder a los mismos params limpios que se enviaron.
    const { signature } = signFlowParams(
      {
        apiKey: "api-key",
        commerceOrder: sentBody.get("commerceOrder"),
        subject: sentBody.get("subject"),
        currency: sentBody.get("currency"),
        amount: sentBody.get("amount"),
        email: sentBody.get("email"),
        paymentMethod: sentBody.get("paymentMethod"),
        urlConfirmation: sentBody.get("urlConfirmation"),
        urlReturn: sentBody.get("urlReturn"),
        optional: sentBody.get("optional"),
      },
      "secret-key",
    );
    expect(sentBody.get("s")).toBe(signature);
  });

  it("plan webpay-6 -> usa amount/paymentMethod/subjectSuffix del plan de cuotas", async () => {
    setFlowEnv({ apiKey: "api-key", secretKey: "secret-key" });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://flow.cl/pay", token: "tok-2", flowOrder: 222 }),
    });

    await createFlowCheckout({ ...baseInput, plan: "webpay-6" });

    const [, calledInit] = fetchMock.mock.calls[0];
    const sentBody = calledInit.body as URLSearchParams;
    expect(sentBody.get("amount")).toBe(String(PAYMENT_PLANS["webpay-6"].amount));
    expect(sentBody.get("paymentMethod")).toBe("1");
    expect(sentBody.get("subject")).toBe(
      "Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria — 6 cuotas",
    );
  });

  it("plan fuera de PAYMENT_PLANS sin overrides -> amount 0 y paymentMethod 9 por defecto", async () => {
    setFlowEnv({ apiKey: "api-key", secretKey: "secret-key" });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://flow.cl/pay", token: "tok-3", flowOrder: 333 }),
    });

    const result = await createFlowCheckout({ ...baseInput, plan: "liderazgo-plan" });

    expect(result).toMatchObject({ amount: 0 });
    const [, calledInit] = fetchMock.mock.calls[0];
    const sentBody = calledInit.body as URLSearchParams;
    expect(sentBody.get("amount")).toBe("0");
    expect(sentBody.get("paymentMethod")).toBe("9");
    // Sin subjectOverride, cae al subject del Diplomado (sin sufijo porque el plan no existe).
    expect(sentBody.get("subject")).toBe(
      "Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria",
    );
  });

  it("plan fuera de PAYMENT_PLANS con overrides (amountOverride/paymentMethodOverride/subjectOverride) -> usa los overrides", async () => {
    setFlowEnv({ apiKey: "api-key", secretKey: "secret-key" });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://flow.cl/pay", token: "tok-4", flowOrder: 444 }),
    });

    const result = await createFlowCheckout({
      ...baseInput,
      plan: "liderazgo-jornada",
      amountOverride: 199_000,
      paymentMethodOverride: 2,
      subjectOverride: "Programa de Liderazgo",
    });

    expect(result).toMatchObject({ amount: 199_000 });
    const [, calledInit] = fetchMock.mock.calls[0];
    const sentBody = calledInit.body as URLSearchParams;
    expect(sentBody.get("amount")).toBe("199000");
    expect(sentBody.get("paymentMethod")).toBe("2");
    expect(sentBody.get("subject")).toBe("Programa de Liderazgo");
  });

  it("NEXT_PUBLIC_APP_URL https válido -> se usa como base de urlConfirmation/urlReturn (sin slash final duplicado)", async () => {
    setFlowEnv({
      apiKey: "api-key",
      secretKey: "secret-key",
      appUrl: "https://staging.capitalacademy.cl/",
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://flow.cl/pay", token: "tok-5", flowOrder: 555 }),
    });

    await createFlowCheckout(baseInput);

    const [, calledInit] = fetchMock.mock.calls[0];
    const sentBody = calledInit.body as URLSearchParams;
    expect(sentBody.get("urlConfirmation")).toBe(
      "https://staging.capitalacademy.cl/api/flow/webhook",
    );
    expect(sentBody.get("urlReturn")).toBe(
      "https://staging.capitalacademy.cl/pago/resultado",
    );
  });

  it("NEXT_PUBLIC_APP_URL http (no https) -> cae al dominio de producción", async () => {
    setFlowEnv({
      apiKey: "api-key",
      secretKey: "secret-key",
      appUrl: "http://localhost:3000",
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://flow.cl/pay", token: "tok-6", flowOrder: 666 }),
    });

    await createFlowCheckout(baseInput);

    const [, calledInit] = fetchMock.mock.calls[0];
    const sentBody = calledInit.body as URLSearchParams;
    expect(sentBody.get("urlConfirmation")).toBe(
      "https://capitalacademy.cl/api/flow/webhook",
    );
  });

  it("Flow responde error HTTP -> error 502 y loguea status + cuerpo", async () => {
    setFlowEnv({ apiKey: "api-key", secretKey: "secret-key" });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });

    const result = await createFlowCheckout(baseInput);

    expect(result).toEqual({
      errorMessage: "No pudimos iniciar el pago en Flow.",
      status: 502,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Flow payment/create error:",
      401,
      "unauthorized",
    );
  });

  it("fetch rechaza (falla de red) -> error 502 y loguea el error", async () => {
    setFlowEnv({ apiKey: "api-key", secretKey: "secret-key" });
    const networkError = new Error("getaddrinfo ENOTFOUND www.flow.cl");
    fetchMock.mockRejectedValue(networkError);

    const result = await createFlowCheckout(baseInput);

    expect(result).toEqual({
      errorMessage: "No pudimos iniciar el pago en Flow.",
      status: 502,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Flow payment/create network error:",
      networkError,
    );
  });

  it("Flow responde 200 con cuerpo no-JSON -> error 502 de respuesta incompleta", async () => {
    setFlowEnv({ apiKey: "api-key", secretKey: "secret-key" });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
      text: async () => "<html>mantención</html>",
    });

    const result = await createFlowCheckout(baseInput);

    expect(result).toEqual({
      errorMessage: "Respuesta incompleta de Flow.",
      status: 502,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Flow payment/create respuesta no-JSON",
      200,
      "<html>mantención</html>",
    );
  });

  it("Flow responde 200 pero sin url/token/flowOrder -> error 502 de respuesta incompleta", async () => {
    setFlowEnv({ apiKey: "api-key", secretKey: "secret-key" });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://flow.cl/pay" }), // falta token y flowOrder
    });

    const result = await createFlowCheckout(baseInput);

    expect(result).toEqual({
      errorMessage: "Respuesta incompleta de Flow.",
      status: 502,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Flow payment/create incomplete response",
      { url: "https://flow.cl/pay" },
    );
  });
});

describe("isPaymentPlan", () => {
  it("acepta cualquiera de las claves conocidas de PAYMENT_PLANS", () => {
    for (const key of PAYMENT_PLAN_KEYS) {
      expect(isPaymentPlan(key)).toBe(true);
    }
  });

  it("rechaza un string que no es un plan conocido", () => {
    expect(isPaymentPlan("plan-inexistente")).toBe(false);
  });

  it("rechaza valores que no son string (número, undefined, null, objeto)", () => {
    expect(isPaymentPlan(123)).toBe(false);
    expect(isPaymentPlan(undefined)).toBe(false);
    expect(isPaymentPlan(null)).toBe(false);
    expect(isPaymentPlan({})).toBe(false);
  });
});
