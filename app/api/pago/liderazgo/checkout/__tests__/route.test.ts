import { describe, it, expect, vi, beforeEach } from "vitest";
import { LIDERAZGO_LAUNCH_CODE } from "@/lib/programs/liderazgo";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockCreateFlowCheckout = vi.fn();
vi.mock("@/lib/flow/checkout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/flow/checkout")>();
  return {
    ...actual,
    createFlowCheckout: (...args: unknown[]) => mockCreateFlowCheckout(...args),
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

const { POST } = await import("@/app/api/pago/liderazgo/checkout/route");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// Cada request usa una IP distinta para no chocar con el rate limiter
// compartido (módulo singleton) entre tests que no lo están probando a él.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.1.0.${ipCounter}`;
}

function makeRequest(
  body: unknown,
  opts: { headers?: Record<string, string>; raw?: string } = {},
) {
  return new Request("http://localhost/api/pago/liderazgo/checkout", {
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
    plan: "lid-contado",
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

describe("POST /api/pago/liderazgo/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertSingle.mockResolvedValue({ data: { id: "pay-lid-1" }, error: null });
    mockUpdateEq.mockResolvedValue({ error: null });
    mockCreateFlowCheckout.mockResolvedValue({
      url: "https://www.flow.cl/pay",
      token: "tok-lid-123",
      flowOrder: 555,
      redirectUrl: "https://www.flow.cl/pay?token=tok-lid-123",
      amount: 450_000,
      commerceOrder: "CA-fake",
    });
  });

  it("responde 429 cuando se excede el límite de solicitudes por IP", async () => {
    const ip = "10.88.88.88";
    const req = () =>
      new Request("http://localhost/api/pago/liderazgo/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(validPayload()),
      });

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
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("responde 422 cuando la validación de zod falla (RUT inválido)", async () => {
    const res = await POST(makeRequest(validPayload({ rut: "11111111-9" })));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
    expect(json.issues).toBeDefined();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("responde 422 cuando falta un campo requerido", async () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).email;
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(422);
  });

  it("responde 422 cuando documentType=factura no trae los datos de la empresa", async () => {
    const res = await POST(
      makeRequest(validPayload({ documentType: "factura" })),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.issues.fieldErrors ?? json.issues).toBeTruthy();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("responde 500 cuando falla el insert en la base de datos", async () => {
    mockInsertSingle.mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });

    const res = await POST(makeRequest(validPayload()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No pudimos registrar el pago.");
    expect(mockCreateFlowCheckout).not.toHaveBeenCalled();
  });

  it("responde 500 cuando el insert no retorna datos (sin error explícito)", async () => {
    mockInsertSingle.mockResolvedValue({ data: null, error: null });

    const res = await POST(makeRequest(validPayload()));
    expect(res.status).toBe(500);
    expect(mockCreateFlowCheckout).not.toHaveBeenCalled();
  });

  it("cuando Flow falla: marca el pago como failed y devuelve el error de Flow", async () => {
    mockCreateFlowCheckout.mockResolvedValue({
      errorMessage: "No pudimos iniciar el pago en Flow.",
      status: 502,
    });

    const res = await POST(makeRequest(validPayload()));

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("No pudimos iniciar el pago en Flow.");
    expect(mockUpdatePayload).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        failure_reason: "No pudimos iniciar el pago en Flow.",
      }),
    );
    expect(mockUpdateEq).toHaveBeenCalledWith("id", "pay-lid-1");
  });

  it("camino feliz sin código de lanzamiento: cobra el precio normal del plan", async () => {
    const res = await POST(makeRequest(validPayload({ plan: "lid-46" })));

    expect(res.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.amount_clp).toBe(480_060);
    expect(insertPayload.plan).toBe("lid-46");
    expect(insertPayload.status).toBe("pending");
    expect(insertPayload.provider).toBe("flow");
    expect(insertPayload).not.toHaveProperty("coupon_code");
    expect(insertPayload).not.toHaveProperty("discount_clp");

    expect(mockCreateFlowCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        amountOverride: 480_060,
        paymentMethodOverride: 1,
        subjectOverride: expect.stringContaining("4-6 cuotas"),
      }),
    );

    const json = await res.json();
    expect(json.provider).toBe("flow");
    expect(json.paymentId).toBe("pay-lid-1");
    expect(json.redirectUrl).toBe("https://www.flow.cl/pay?token=tok-lid-123");
  });

  it("con código de lanzamiento válido: aplica el precio de lanzamiento y guarda el descuento", async () => {
    const res = await POST(
      makeRequest(validPayload({ plan: "lid-contado", launchCode: LIDERAZGO_LAUNCH_CODE })),
    );

    expect(res.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.amount_clp).toBe(360_000); // launchAmount
    expect(insertPayload.coupon_code).toBe(LIDERAZGO_LAUNCH_CODE);
    expect(insertPayload.discount_clp).toBe(90_000); // 450_000 - 360_000

    expect(mockCreateFlowCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amountOverride: 360_000 }),
    );
  });

  it("el código de lanzamiento es case-insensitive", async () => {
    const res = await POST(
      makeRequest(validPayload({ launchCode: "liderazgo20" })),
    );

    expect(res.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.amount_clp).toBe(360_000);
    expect(insertPayload.coupon_code).toBe(LIDERAZGO_LAUNCH_CODE);
  });

  it("con un código de lanzamiento inválido: cobra el precio normal sin descuento", async () => {
    const res = await POST(
      makeRequest(validPayload({ launchCode: "NOEXISTE" })),
    );

    expect(res.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.amount_clp).toBe(450_000);
    expect(insertPayload).not.toHaveProperty("coupon_code");
    expect(insertPayload).not.toHaveProperty("discount_clp");
  });

  it("guarda invoice_data cuando documentType=factura y datos completos", async () => {
    const res = await POST(
      makeRequest(
        validPayload({ documentType: "factura", invoice: validInvoiceData }),
      ),
    );
    expect(res.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.document_type).toBe("factura");
    expect(insertPayload.invoice_data).toMatchObject({
      razonSocial: "Empresa SPA",
      giro: "Comercio",
    });
  });

  it("invoice_data es null cuando documentType=boleta", async () => {
    const res = await POST(makeRequest(validPayload({ documentType: "boleta" })));
    expect(res.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.invoice_data).toBeNull();
  });

  it("toma la primera IP de x-forwarded-for y la guarda en ip_address", async () => {
    const res = await POST(
      makeRequest(validPayload(), {
        headers: { "x-forwarded-for": `${nextIp()}, 5.6.7.8`, "user-agent": "vitest-agent" },
      }),
    );
    expect(res.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.ip_address).not.toContain(",");
    expect(insertPayload.user_agent).toBe("vitest-agent");
  });

  it("ip_address queda null cuando no hay x-forwarded-for", async () => {
    const res = await POST(
      new Request("http://localhost/api/pago/liderazgo/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-real-ip": nextIp(), // usado solo para el rate limiter, no para ip_address
        },
        body: JSON.stringify(validPayload()),
      }),
    );
    expect(res.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.ip_address).toBeNull();
  });

  it("cuando falla el update de flow_token/flow_order, igual responde 200 (recuperable por cron)", async () => {
    mockUpdateEq.mockResolvedValue({ error: { message: "update failed" } });

    const res = await POST(makeRequest(validPayload()));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentId).toBe("pay-lid-1");
    expect(mockUpdatePayload).toHaveBeenCalledWith({
      flow_token: "tok-lid-123",
      flow_order: 555,
    });
  });

  it("el commerce_order sigue el formato CA-LID-<id>-<timestamp>", async () => {
    const res = await POST(makeRequest(validPayload()));
    expect(res.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.commerce_order).toMatch(/^CA-LID-[0-9a-f]{8}-[0-9a-z]+$/);
    expect(insertPayload.id).toBeTruthy();
  });
});
