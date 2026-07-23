import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createDiplomadoCheckoutSession,
  DIPLOMADO_PRICE_CLP,
  type CheckoutSessionInput,
} from "@/lib/fintoc/checkout";

const ORIGINAL_SECRET = process.env.FINTOC_SECRET_KEY;
const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

const baseInput: CheckoutSessionInput = {
  paymentId: "pay-123",
  firstname: "Ana",
  lastname: "Pérez",
  rut: "11.111.111-1",
  email: "ana@example.com",
  phone: "+56911111111",
};

function jsonResponse(ok: boolean, status: number, body: unknown, text = "") {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => text,
  };
}

describe("createDiplomadoCheckoutSession", () => {
  beforeEach(() => {
    process.env.FINTOC_SECRET_KEY = "sk-test";
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    process.env.FINTOC_SECRET_KEY = ORIGINAL_SECRET;
    process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sin FINTOC_SECRET_KEY devuelve error 500 sin llamar a fetch", async () => {
    delete process.env.FINTOC_SECRET_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDiplomadoCheckoutSession(baseInput);

    expect(result).toEqual({
      errorMessage: "Falta configurar FINTOC_SECRET_KEY.",
      status: 500,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("camino feliz: primer intento (v2 + header plano) exitoso", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(true, 200, { id: "cs_1", session_token: "tok_1" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDiplomadoCheckoutSession(baseInput);

    expect(result).toEqual({
      sessionToken: "tok_1",
      checkoutSessionId: "cs_1",
      amount: DIPLOMADO_PRICE_CLP,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.fintoc.com/v2/checkout_sessions");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("sk-test");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.cache).toBe("no-store");

    const payload = JSON.parse(options.body);
    expect(payload.amount).toBe(DIPLOMADO_PRICE_CLP);
    expect(payload.currency).toBe("CLP");
    expect(payload.success_url).toBe(
      "https://capitalacademy.cl/pago/gracias?id=pay-123",
    );
    expect(payload.cancel_url).toBe("https://capitalacademy.cl/pago");
    expect(payload.customer.name).toBe("Ana Pérez");
    expect(payload.customer.email).toBe("ana@example.com");
    expect(payload.customer.metadata).toEqual({
      phone: "+56911111111",
      rut: "11.111.111-1",
    });
    expect(payload.metadata).toEqual({
      flow: "diplomado-ingreso",
      payment_id: "pay-123",
      email: "ana@example.com",
      rut: "11.111.111-1",
    });
  });

  it("usa amountOverride en vez del precio fijo del Diplomado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(true, 200, { id: "cs_2", session_token: "tok_2" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDiplomadoCheckoutSession({
      ...baseInput,
      amountOverride: 123_000,
    });

    expect(result).toEqual({
      sessionToken: "tok_2",
      checkoutSessionId: "cs_2",
      amount: 123_000,
    });
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.amount).toBe(123_000);
  });

  it("usa NEXT_PUBLIC_APP_URL (sin slash final) para success_url/cancel_url", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.capitalacademy.cl/";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(true, 200, { id: "cs_3", session_token: "tok_3" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createDiplomadoCheckoutSession(baseInput);

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.success_url).toBe(
      "https://staging.capitalacademy.cl/pago/gracias?id=pay-123",
    );
    expect(payload.cancel_url).toBe("https://staging.capitalacademy.cl/pago");
  });

  it("si el header plano falla (401), reintenta con Bearer en la misma base y tiene éxito", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(false, 401, null, "unauthorized"))
      .mockResolvedValueOnce(
        jsonResponse(true, 200, { id: "cs_4", session_token: "tok_4" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDiplomadoCheckoutSession(baseInput);

    expect(result).toEqual({
      sessionToken: "tok_4",
      checkoutSessionId: "cs_4",
      amount: DIPLOMADO_PRICE_CLP,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.fintoc.com/v2/checkout_sessions",
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("sk-test");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.fintoc.com/v2/checkout_sessions",
    );
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer sk-test",
    );
  });

  it("si ambos headers fallan en v2, cae a v1 y tiene éxito ahí", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(false, 404, null, "not found v2 plano"))
      .mockResolvedValueOnce(jsonResponse(false, 404, null, "not found v2 bearer"))
      .mockResolvedValueOnce(
        jsonResponse(true, 200, { id: "cs_5", session_token: "tok_5" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDiplomadoCheckoutSession(baseInput);

    expect(result).toEqual({
      sessionToken: "tok_5",
      checkoutSessionId: "cs_5",
      amount: DIPLOMADO_PRICE_CLP,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe(
      "https://api.fintoc.com/v1/checkout_sessions",
    );
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("sk-test");
  });

  it("si la respuesta ok viene sin session_token o id, se considera fallida y continúa al siguiente intento", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(true, 200, { id: "cs_incompleto" })) // sin session_token
      .mockResolvedValueOnce(
        jsonResponse(true, 200, { id: "cs_6", session_token: "tok_6" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDiplomadoCheckoutSession(baseInput);

    expect(result).toEqual({
      sessionToken: "tok_6",
      checkoutSessionId: "cs_6",
      amount: DIPLOMADO_PRICE_CLP,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("si los 4 intentos (v2/v1 x header plano/bearer) fallan, devuelve error 502 y loguea el último error", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(false, 500, null, "error v2 plano"))
      .mockResolvedValueOnce(jsonResponse(false, 500, null, "error v2 bearer"))
      .mockResolvedValueOnce(jsonResponse(false, 500, null, "error v1 plano"))
      .mockResolvedValueOnce(jsonResponse(false, 500, null, "error v1 bearer"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDiplomadoCheckoutSession(baseInput);

    expect(result).toEqual({
      errorMessage:
        "No pudimos iniciar el pago. Revisa configuración de Fintoc.",
      status: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Fintoc checkout error:",
      expect.stringContaining("error v1 bearer"),
    );
  });
});
