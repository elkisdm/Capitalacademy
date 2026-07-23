import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockGetActiveProvider = vi.fn<() => string>(() => "flow");
vi.mock("@/lib/payments/provider", () => ({
  getActivePaymentProvider: () => mockGetActiveProvider(),
}));

const mockCreateFlowCheckout = vi.fn();
vi.mock("@/lib/flow/checkout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flow/checkout")>();
  return {
    ...actual,
    createFlowCheckout: (...args: unknown[]) => mockCreateFlowCheckout(...args),
  };
});

const mockLookupCoupon = vi.fn();
vi.mock("@/lib/coupons/validate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/coupons/validate")>();
  return {
    ...actual,
    lookupCoupon: (...args: unknown[]) => mockLookupCoupon(...args),
  };
});

const mockInsertPayload = vi.fn();
const mockInsertSingle = vi.fn();
const mockUpdatePayload = vi.fn();
const mockUpdateEq = vi.fn();
const mockCreateAdminClient = vi.fn();

function makePaymentsTable() {
  return {
    insert: (payload: unknown) => {
      mockInsertPayload(payload);
      return {
        select: () => ({
          single: () => mockInsertSingle(),
        }),
      };
    },
    update: (payload: unknown) => {
      mockUpdatePayload(payload);
      return {
        eq: (...args: unknown[]) => mockUpdateEq(...args),
      };
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => {
    mockCreateAdminClient(...args);
    return {
      from: (table: string) => (table === "payments" ? makePaymentsTable() : {}),
    };
  },
}));

const { POST } = await import("@/app/api/pago/checkout/route");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// Cada request usa una IP distinta para no chocar con el rate limiter
// compartido (módulo singleton) entre tests que no lo están probando a él.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

function makeRequest(
  body: unknown,
  opts: { headers?: Record<string, string>; raw?: string } = {},
) {
  return new Request("http://localhost/api/pago/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": nextIp(),
      ...opts.headers,
    },
    body: opts.raw ?? JSON.stringify(body),
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstname: "Juan",
    lastname: "Pérez",
    rut: "12345678-5",
    email: "juan@test.com",
    phone: "+56912345678",
    plan: "contado",
    documentType: "boleta",
    ...overrides,
  };
}

const validInvoiceData = {
  razonSocial: "Empresa SPA",
  rut: "76543210-3",
  giro: "Comercio",
  direccion: "Calle Falsa 123",
  email: "facturacion@empresa.cl",
};

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe("POST /api/pago/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveProvider.mockReturnValue("flow");
    mockInsertSingle.mockResolvedValue({ data: { id: "pay-1" }, error: null });
    mockUpdateEq.mockResolvedValue({ error: null });
    mockCreateFlowCheckout.mockResolvedValue({
      url: "https://www.flow.cl/pay",
      token: "tok-123",
      flowOrder: 999,
      redirectUrl: "https://www.flow.cl/pay?token=tok-123",
      amount: 500_000,
      commerceOrder: "CA-fake",
    });
  });

  it("responde 429 cuando se excede el límite de solicitudes por IP", async () => {
    const ip = "10.99.99.99";
    const req = () =>
      new Request("http://localhost/api/pago/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(validPayload()),
      });

    for (let i = 0; i < 5; i += 1) {
      const res = await POST(req());
      expect(res!.status).not.toBe(429);
    }
    const blocked = await POST(req());
    expect(blocked!.status).toBe(429);
    expect(blocked!.headers.get("Retry-After")).toBeTruthy();
  });

  it("responde 400 cuando el cuerpo no es JSON válido", async () => {
    const res = await POST(makeRequest(null, { raw: "{esto-no-es-json" }));
    expect(res!.status).toBe(400);
    const json = await res!.json();
    expect(json.error).toBe("Cuerpo inválido");
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("responde 422 cuando la validación de zod falla (RUT inválido)", async () => {
    const res = await POST(makeRequest(validPayload({ rut: "11111111-9" })));
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.error).toBe("Validación fallida");
    expect(json.issues).toBeDefined();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("responde 422 cuando falta un campo requerido", async () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).email;
    const res = await POST(makeRequest(payload));
    expect(res!.status).toBe(422);
  });

  it("responde 422 cuando documentType=factura no trae los datos de la empresa", async () => {
    const res = await POST(
      makeRequest(validPayload({ documentType: "factura" })),
    );
    expect(res!.status).toBe(422);
    const json = await res!.json();
    expect(json.issues.fieldErrors ?? json.issues).toBeTruthy();
  });

  it("propaga el error del cupón sin tocar la base de datos", async () => {
    mockLookupCoupon.mockResolvedValue({
      ok: false,
      error: "Cupón expirado.",
      status: 410,
    });

    const res = await POST(
      makeRequest(validPayload({ couponCode: "VIEJO10" })),
    );

    expect(res!.status).toBe(410);
    const json = await res!.json();
    expect(json.error).toBe("Cupón expirado.");
    expect(mockLookupCoupon).toHaveBeenCalledWith("VIEJO10");
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
    expect(mockCreateFlowCheckout).not.toHaveBeenCalled();
  });

  it("aplica el cupón válido: descuenta el monto e inserta los campos de cupón", async () => {
    mockLookupCoupon.mockResolvedValue({
      ok: true,
      coupon: {
        id: "cp-1",
        code: "PROMO10",
        percent_off: 10,
        label: "Promo 10%",
        valid_from: null,
        valid_until: null,
        max_redemptions: null,
        redemptions: 0,
        active: true,
      },
    });

    const res = await POST(
      makeRequest(validPayload({ couponCode: "promo10" })),
    );

    expect(res!.status).toBe(200);
    expect(mockInsertPayload).toHaveBeenCalledTimes(1);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.amount_clp).toBe(450_000); // 500_000 - 10%
    expect(insertPayload.coupon_id).toBe("cp-1");
    expect(insertPayload.coupon_code).toBe("PROMO10");
    expect(insertPayload.discount_clp).toBe(50_000);

    expect(mockCreateFlowCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amountOverride: 450_000 }),
    );
  });

  it("sin cupón: no incluye campos de cupón y usa el monto base del plan", async () => {
    const res = await POST(makeRequest(validPayload({ plan: "webpay-6" })));

    expect(res!.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.amount_clp).toBe(533_400);
    expect(insertPayload).not.toHaveProperty("coupon_id");
    expect(insertPayload).not.toHaveProperty("coupon_code");
    expect(insertPayload).not.toHaveProperty("discount_clp");

    expect(mockCreateFlowCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amountOverride: undefined, plan: "webpay-6" }),
    );
  });

  it("guarda invoice_data cuando documentType=factura y datos completos", async () => {
    const res = await POST(
      makeRequest(
        validPayload({ documentType: "factura", invoice: validInvoiceData }),
      ),
    );
    expect(res!.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.document_type).toBe("factura");
    expect(insertPayload.invoice_data).toMatchObject({
      razonSocial: "Empresa SPA",
      giro: "Comercio",
    });
  });

  it("invoice_data es null cuando documentType=boleta", async () => {
    const res = await POST(makeRequest(validPayload({ documentType: "boleta" })));
    expect(res!.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.invoice_data).toBeNull();
  });

  it("toma la primera IP de x-forwarded-for y la guarda en ip_address", async () => {
    const res = await POST(
      makeRequest(validPayload(), {
        headers: { "x-forwarded-for": `${nextIp()}, 5.6.7.8`, "user-agent": "vitest-agent" },
      }),
    );
    expect(res!.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.ip_address).not.toContain(",");
    expect(insertPayload.user_agent).toBe("vitest-agent");
  });

  it("ip_address queda null cuando no hay x-forwarded-for", async () => {
    const res = await POST(
      new Request("http://localhost/api/pago/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": nextIp(), // usado solo para el rate limiter, no para ip_address
        },
        body: JSON.stringify(validPayload()),
      }),
    );
    expect(res!.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.ip_address).toBeNull();
  });

  it("responde 500 cuando falla el insert en la base de datos", async () => {
    mockInsertSingle.mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });

    const res = await POST(makeRequest(validPayload()));
    expect(res!.status).toBe(500);
    const json = await res!.json();
    expect(json.error).toBe("No pudimos registrar el pago.");
    expect(mockCreateFlowCheckout).not.toHaveBeenCalled();
  });

  it("responde 500 cuando el insert no retorna datos (sin error explícito)", async () => {
    mockInsertSingle.mockResolvedValue({ data: null, error: null });

    const res = await POST(makeRequest(validPayload()));
    expect(res!.status).toBe(500);
    expect(mockCreateFlowCheckout).not.toHaveBeenCalled();
  });

  it("cuando Flow falla: marca el pago como failed y devuelve el error de Flow", async () => {
    mockCreateFlowCheckout.mockResolvedValue({
      errorMessage: "No pudimos iniciar el pago en Flow.",
      status: 502,
    });

    const res = await POST(makeRequest(validPayload()));

    expect(res!.status).toBe(502);
    const json = await res!.json();
    expect(json.error).toBe("No pudimos iniciar el pago en Flow.");
    expect(mockUpdatePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        failure_reason: "No pudimos iniciar el pago en Flow.",
      }),
    );
  });

  it("camino feliz: crea el pago en Flow y responde con la URL de redirección", async () => {
    const res = await POST(makeRequest(validPayload()));

    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.provider).toBe("flow");
    expect(json.paymentId).toBe("pay-1");
    expect(json.redirectUrl).toBe("https://www.flow.cl/pay?token=tok-123");
    expect(json.amount).toBe(500_000);
    expect(mockUpdatePayload).toHaveBeenCalledWith({
      flow_token: "tok-123",
      flow_order: 999,
    });
  });

  it("cuando falla el update de flow_token/flow_order, igual responde 200 (recuperable por cron)", async () => {
    mockUpdateEq.mockResolvedValue({ error: { message: "update failed" } });

    const res = await POST(makeRequest(validPayload()));

    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.paymentId).toBe("pay-1");
  });

  // BUG: si getActivePaymentProvider() alguna vez devuelve un valor distinto
  // de "flow", el handler no tiene rama `else` ni un caso por defecto: la
  // función llega al final sin retornar ningún Response. El registro del pago
  // en `payments` (status "pending") ya se creó antes de este punto, así que
  // queda un pago huérfano en la base de datos y Next.js recibe `undefined`
  // en lugar de una Response (ver app/api/pago/checkout/route.ts línea 173,
  // fin de la función tras el bloque `if (provider === "flow")`). Hoy es
  // inalcanzable porque `getActivePaymentProvider` está tipado a devolver
  // únicamente el literal "flow" (lib/payments/provider.ts), pero si se
  // agrega un segundo proveedor sin agregar la rama, este código se activa.
  it("si el proveedor activo no es 'flow', el handler no retorna ninguna respuesta (rama sin manejar)", async () => {
    mockGetActiveProvider.mockReturnValue("otro-proveedor");

    const res = await POST(makeRequest(validPayload()));

    expect(res).toBeUndefined();
    // El pago ya quedó insertado en estado "pending" sin ninguna forma de
    // completarse: esta es la parte huérfana del bug.
    expect(mockInsertPayload).toHaveBeenCalledTimes(1);
  });
});
