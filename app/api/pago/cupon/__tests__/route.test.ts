import { describe, it, expect, vi, beforeEach } from "vitest";
import { DIPLOMADO_PRICE_CLP } from "@/lib/pricing";

/* ------------------------------------------------------------------ */
/*  Mocks — solo el borde externo (Supabase). lookupCoupon/couponPreview/ */
/*  applyCouponToAmount corren con su lógica real.                      */
/* ------------------------------------------------------------------ */

const mockMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "coupons") throw new Error(`tabla inesperada en mock: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => mockMaybeSingle(),
          }),
        }),
      };
    },
  }),
}));

const { POST } = await import("@/app/api/pago/cupon/route");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// Cada request usa una IP distinta para no chocar con el rate limiter
// compartido (módulo singleton) entre tests que no lo están probando a él.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.2.0.${ipCounter}`;
}

function makeRequest(
  body: unknown,
  opts: { headers?: Record<string, string>; raw?: string } = {},
) {
  return new Request("http://localhost/api/pago/cupon", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": nextIp(),
      ...opts.headers,
    },
    body: opts.raw ?? JSON.stringify(body),
  });
}

function couponRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cpn-1",
    code: "DESCUENTO10",
    percent_off: 10,
    label: "10% de descuento",
    valid_from: null,
    valid_until: null,
    max_redemptions: null,
    redemptions: 0,
    active: true,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe("POST /api/pago/cupon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responde 429 cuando se excede el límite de solicitudes por IP", async () => {
    const ip = "10.77.77.77";
    const req = () =>
      new Request("http://localhost/api/pago/cupon", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ code: "ALGO" }),
      });

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    for (let i = 0; i < 5; i += 1) {
      const res = await POST(req());
      expect(res.status).not.toBe(429);
    }
    const blocked = await POST(req());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("responde 400 cuando el cuerpo no es JSON válido", async () => {
    const res = await POST(makeRequest(null, { raw: "{esto-no-es-json" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Cuerpo inválido");
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("responde 422 cuando falta el código", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("responde 422 cuando el código es solo espacios (queda vacío tras trim)", async () => {
    const res = await POST(makeRequest({ code: "    " }));
    expect(res.status).toBe(422);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("responde 422 cuando el código excede los 40 caracteres", async () => {
    const res = await POST(makeRequest({ code: "A".repeat(41) }));
    expect(res.status).toBe(422);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("responde 500 cuando falla la consulta a Supabase", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "conexión perdida" },
    });

    const res = await POST(makeRequest({ code: "DESCUENTO10" }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No pudimos validar el cupón.");
  });

  it("responde 404 con mensaje uniforme cuando el código no existe", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await POST(makeRequest({ code: "NOEXISTE" }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Cupón no válido.");
  });

  it("responde 404 con mensaje uniforme cuando el cupón está inactivo (no filtra el motivo real)", async () => {
    mockMaybeSingle.mockResolvedValue({ data: couponRow({ active: false }) });

    const res = await POST(makeRequest({ code: "INACTIVO" }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Cupón no válido.");
  });

  it("responde 404 con mensaje uniforme cuando el cupón está expirado", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: couponRow({ valid_until: "2020-01-01T00:00:00Z" }),
    });

    const res = await POST(makeRequest({ code: "EXPIRADO" }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Cupón no válido.");
  });

  it("responde 404 con mensaje uniforme cuando el cupón aún no está vigente", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: couponRow({ valid_from: "2099-01-01T00:00:00Z" }),
    });

    const res = await POST(makeRequest({ code: "FUTURO" }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Cupón no válido.");
  });

  it("responde 404 con mensaje uniforme cuando el cupón está agotado", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: couponRow({ max_redemptions: 5, redemptions: 5 }),
    });

    const res = await POST(makeRequest({ code: "AGOTADO" }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Cupón no válido.");
  });

  it("camino feliz sin plan: usa el plan 'contado' por defecto", async () => {
    mockMaybeSingle.mockResolvedValue({ data: couponRow({ percent_off: 10 }) });

    const res = await POST(makeRequest({ code: "descuento10" }));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.plan).toBe("contado");
    expect(json.baseAmount).toBe(DIPLOMADO_PRICE_CLP);
    expect(json.discountClp).toBe(Math.round(DIPLOMADO_PRICE_CLP * 0.1));
    expect(json.finalAmountClp).toBe(
      DIPLOMADO_PRICE_CLP - Math.round(DIPLOMADO_PRICE_CLP * 0.1),
    );
    expect(json.coupon).toEqual({
      id: "cpn-1",
      code: "DESCUENTO10",
      percentOff: 10,
      label: "10% de descuento",
    });
  });

  it("camino feliz con plan inválido: cae al default 'contado'", async () => {
    mockMaybeSingle.mockResolvedValue({ data: couponRow({ percent_off: 20 }) });

    const res = await POST(makeRequest({ code: "DESCUENTO10", plan: "plan-inexistente" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.plan).toBe("contado");
    expect(json.baseAmount).toBe(DIPLOMADO_PRICE_CLP);
  });

  it("camino feliz con plan válido: usa el monto de ese plan", async () => {
    mockMaybeSingle.mockResolvedValue({ data: couponRow({ percent_off: 15 }) });

    const res = await POST(makeRequest({ code: "DESCUENTO10", plan: "webpay-6" }));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.plan).toBe("webpay-6");
    expect(json.baseAmount).toBe(533_400);
    expect(json.discountClp).toBe(Math.round(533_400 * 0.15));
    expect(json.finalAmountClp).toBe(533_400 - Math.round(533_400 * 0.15));
  });
});
