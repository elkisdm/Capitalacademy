import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signFlowParams } from "@/lib/flow/sign";
import {
  fetchFlowPaymentStatus,
  fetchFlowPaymentStatusByCommerceId,
  mapFlowStatus,
  type FlowPaymentStatus,
  type FlowPaymentStatusCode,
} from "@/lib/flow/status";

const ORIGINAL_ENV = { ...process.env };

function setFlowEnv(apiKey?: string, secretKey?: string) {
  if (apiKey === undefined) delete process.env.FLOW_API_KEY;
  else process.env.FLOW_API_KEY = apiKey;
  if (secretKey === undefined) delete process.env.FLOW_SECRET_KEY;
  else process.env.FLOW_SECRET_KEY = secretKey;
}

const samplePayload: FlowPaymentStatus = {
  flowOrder: 123,
  commerceOrder: "order-1",
  requestDate: "2026-07-20 10:00:00",
  status: 2,
  subject: "Diplomado",
  currency: "CLP",
  amount: 500000,
  payer: "alumno@test.com",
};

describe("fetchFlowPaymentStatus", () => {
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

  it("sin FLOW_API_KEY ni FLOW_SECRET_KEY -> missing-flow-keys, sin llamar a fetch", async () => {
    setFlowEnv(undefined, undefined);
    const result = await fetchFlowPaymentStatus("token-1");
    expect(result).toEqual({ ok: false, status: 500, reason: "missing-flow-keys" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falta solo FLOW_SECRET_KEY -> también missing-flow-keys", async () => {
    setFlowEnv("api-key", undefined);
    const result = await fetchFlowPaymentStatus("token-1");
    expect(result).toEqual({ ok: false, status: 500, reason: "missing-flow-keys" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Flow responde error HTTP -> ok:false con el status real y loguea el cuerpo", async () => {
    setFlowEnv("api-key", "secret-key");
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });

    const result = await fetchFlowPaymentStatus("token-1");

    expect(result).toEqual({ ok: false, status: 401, reason: "flow-api-error" });
    expect(consoleErrorSpy).toHaveBeenCalledWith("Flow getStatus error", 401, "unauthorized");
  });

  it("camino feliz -> ok:true con el payload de Flow, GET firmado a getStatus", async () => {
    setFlowEnv("api-key", "secret-key");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => samplePayload,
    });

    const result = await fetchFlowPaymentStatus("token-1");

    expect(result).toEqual({ ok: true, data: samplePayload });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledInit).toMatchObject({ method: "GET", cache: "no-store" });

    const url = new URL(calledUrl as string);
    expect(url.pathname).toBe("/api/payment/getStatus");
    expect(url.searchParams.get("apiKey")).toBe("api-key");
    expect(url.searchParams.get("token")).toBe("token-1");

    const { signature } = signFlowParams({ apiKey: "api-key", token: "token-1" }, "secret-key");
    expect(url.searchParams.get("s")).toBe(signature);
  });
});

describe("fetchFlowPaymentStatusByCommerceId", () => {
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

  it("sin FLOW_API_KEY ni FLOW_SECRET_KEY -> missing-flow-keys, sin llamar a fetch", async () => {
    setFlowEnv(undefined, undefined);
    const result = await fetchFlowPaymentStatusByCommerceId("order-1");
    expect(result).toEqual({ ok: false, status: 500, reason: "missing-flow-keys" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Flow responde error HTTP -> ok:false con el status real y loguea el cuerpo", async () => {
    setFlowEnv("api-key", "secret-key");
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "not found",
    });

    const result = await fetchFlowPaymentStatusByCommerceId("order-1");

    expect(result).toEqual({ ok: false, status: 404, reason: "flow-api-error" });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Flow getStatusByCommerceId error",
      404,
      "not found",
    );
  });

  it("camino feliz -> ok:true con el payload de Flow, GET firmado a getStatusByCommerceId", async () => {
    setFlowEnv("api-key", "secret-key");
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => samplePayload,
    });

    const result = await fetchFlowPaymentStatusByCommerceId("order-1");

    expect(result).toEqual({ ok: true, data: samplePayload });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledInit).toMatchObject({ method: "GET", cache: "no-store" });

    const url = new URL(calledUrl as string);
    expect(url.pathname).toBe("/api/payment/getStatusByCommerceId");
    expect(url.searchParams.get("apiKey")).toBe("api-key");
    expect(url.searchParams.get("commerceId")).toBe("order-1");

    const { signature } = signFlowParams(
      { apiKey: "api-key", commerceId: "order-1" },
      "secret-key",
    );
    expect(url.searchParams.get("s")).toBe(signature);
  });
});

describe("mapFlowStatus", () => {
  it("2 -> succeeded", () => {
    expect(mapFlowStatus(2)).toBe("succeeded");
  });

  it("3 -> failed", () => {
    expect(mapFlowStatus(3)).toBe("failed");
  });

  it("4 -> refunded", () => {
    expect(mapFlowStatus(4)).toBe("refunded");
  });

  it("1 -> pending", () => {
    expect(mapFlowStatus(1)).toBe("pending");
  });

  it("código desconocido (fuera del rango 1-4) -> pending por el default", () => {
    // Flow es un proveedor externo: si algún día agrega un código nuevo que
    // no está en el tipo, el default debe degradar a "pending" en vez de
    // lanzar o devolver undefined.
    expect(mapFlowStatus(99 as unknown as FlowPaymentStatusCode)).toBe("pending");
  });
});
