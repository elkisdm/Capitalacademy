import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockGetSecret = vi.fn<() => string | null>(() => "secreto-de-prueba-1234567890");
const mockVerifyCobro = vi.fn<
  (amount: number, concepto: string | null | undefined, sig: string, secret: string) => boolean
>(() => true);

vi.mock("@/lib/cobro/sign", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cobro/sign")>();
  return {
    ...actual,
    getCobroSigningSecret: () => mockGetSecret(),
    verifyCobro: (...args: Parameters<typeof mockVerifyCobro>) =>
      mockVerifyCobro(...args),
  };
});

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

const { POST } = await import("@/app/api/pago/cobro/route");

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
  return new Request("http://localhost/api/pago/cobro", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": nextIp(),
      ...opts.headers,
    },
    body: opts.raw ?? JSON.stringify(body),
  });
}

// 64 chars hex, formato válido de firma, aunque `verifyCobro` está mockeado.
const VALID_SIG = "a".repeat(64);

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstname: "Juan",
    lastname: "Pérez",
    rut: "12345678-5",
    email: "juan@test.com",
    phone: "+56912345678",
    monto: 100_000,
    sig: VALID_SIG,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe("POST /api/pago/cobro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSecret.mockReturnValue("secreto-de-prueba-1234567890");
    mockVerifyCobro.mockReturnValue(true);
    mockInsertSingle.mockResolvedValue({ data: { id: "pay-1" }, error: null });
    mockUpdateEq.mockResolvedValue({ error: null });
    mockCreateFlowCheckout.mockResolvedValue({
      url: "https://www.flow.cl/pay",
      token: "tok-123",
      flowOrder: 999,
      redirectUrl: "https://www.flow.cl/pay?token=tok-123",
      amount: 100_000,
      commerceOrder: "CO-fake",
    });
  });

  it("responde 429 cuando se excede el límite de solicitudes por IP", async () => {
    const ip = "10.99.99.98";
    const req = () =>
      new Request("http://localhost/api/pago/cobro", {
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

  it("responde 422 cuando el RUT es inválido", async () => {
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

  it("responde 422 cuando el monto no es entero positivo", async () => {
    const res = await POST(makeRequest(validPayload({ monto: -100 })));
    expect(res.status).toBe(422);
  });

  it("responde 422 cuando el monto excede el máximo permitido (5.000.000)", async () => {
    const res = await POST(makeRequest(validPayload({ monto: 5_000_001 })));
    expect(res.status).toBe(422);
  });

  it("responde 422 cuando la firma no tiene formato hex de 64 caracteres", async () => {
    const res = await POST(makeRequest(validPayload({ sig: "no-es-hex" })));
    expect(res.status).toBe(422);
    expect(mockVerifyCobro).not.toHaveBeenCalled();
  });

  it("responde 422 cuando el plan no es uno de los planes de cobro válidos", async () => {
    const res = await POST(makeRequest(validPayload({ plan: "webpay-6" })));
    expect(res.status).toBe(422);
  });

  it("responde 500 y no llama a Supabase cuando falta COBRO_SIGNING_SECRET", async () => {
    mockGetSecret.mockReturnValue(null);
    const res = await POST(makeRequest(validPayload()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Cobro no disponible. Falta configuración.");
    expect(mockVerifyCobro).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("responde 403 cuando la firma no verifica (monto/concepto adulterado)", async () => {
    mockVerifyCobro.mockReturnValue(false);
    const res = await POST(makeRequest(validPayload()));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("El monto del cobro no es válido.");
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it("camino feliz con plan por defecto (contado): registra el pago sin recargo y usa el concepto por defecto", async () => {
    const res = await POST(makeRequest(validPayload()));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.provider).toBe("flow");
    expect(json.paymentId).toBe("pay-1");
    expect(json.redirectUrl).toBe("https://www.flow.cl/pay?token=tok-123");

    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.amount_clp).toBe(100_000);
    expect(insertPayload.plan).toBeNull();
    expect(insertPayload.status).toBe("pending");
    expect(insertPayload.provider).toBe("flow");
    expect(insertPayload.commerce_order).toMatch(/^CO-/);

    expect(mockCreateFlowCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "contado",
        amountOverride: 100_000,
        subjectOverride: "Pago a Capital Academy",
        paymentMethodOverride: 9,
      }),
    );
  });

  it("usa el concepto normalizado en el subject cuando viene en el payload", async () => {
    const res = await POST(
      makeRequest(validPayload({ concepto: "  Curso de Excel  " })),
    );
    expect(res.status).toBe(200);
    expect(mockCreateFlowCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ subjectOverride: "Curso de Excel" }),
    );
    expect(mockVerifyCobro).toHaveBeenCalledWith(
      100_000,
      "Curso de Excel",
      VALID_SIG,
      "secreto-de-prueba-1234567890",
    );
  });

  it("plan cobro-6: recalcula el monto final con recargo y usa paymentMethod de Webpay cuotas", async () => {
    const res = await POST(makeRequest(validPayload({ plan: "cobro-6" })));
    expect(res.status).toBe(200);

    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.amount_clp).toBe(106_680); // 100_000 * 1.0668

    expect(mockCreateFlowCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "cobro-6",
        amountOverride: 106_680,
        paymentMethodOverride: 1,
        subjectOverride: "Pago a Capital Academy — 6 cuotas",
      }),
    );
  });

  it("plan cobro-12: recalcula el monto final con el recargo correspondiente", async () => {
    const res = await POST(makeRequest(validPayload({ plan: "cobro-12" })));
    expect(res.status).toBe(200);

    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.amount_clp).toBe(110_180); // 100_000 * 1.1018

    expect(mockCreateFlowCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: "cobro-12",
        amountOverride: 110_180,
        paymentMethodOverride: 1,
        subjectOverride: "Pago a Capital Academy — 12 cuotas",
      }),
    );
  });

  it("verifica la firma SIEMPRE contra el monto BASE firmado (no el monto final con recargo)", async () => {
    const res = await POST(makeRequest(validPayload({ plan: "cobro-12" })));
    expect(res.status).toBe(200);
    // El primer argumento de verifyCobro debe ser el monto base (100_000),
    // nunca el monto final recargado (110_180): el recargo se recomputa
    // server-side y no debe alterar lo que la firma protege.
    expect(mockVerifyCobro).toHaveBeenCalledWith(
      100_000,
      "",
      VALID_SIG,
      "secreto-de-prueba-1234567890",
    );
  });

  it("toma la primera IP de x-forwarded-for y la guarda en ip_address junto al user-agent", async () => {
    const res = await POST(
      makeRequest(validPayload(), {
        headers: {
          "x-forwarded-for": `${nextIp()}, 5.6.7.8`,
          "user-agent": "vitest-agent",
        },
      }),
    );
    expect(res.status).toBe(200);
    const insertPayload = mockInsertPayload.mock.calls[0][0];
    expect(insertPayload.ip_address).not.toContain(",");
    expect(insertPayload.user_agent).toBe("vitest-agent");
  });

  it("ip_address queda null cuando no hay x-forwarded-for", async () => {
    const res = await POST(
      new Request("http://localhost/api/pago/cobro", {
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

  it("responde 500 cuando falla el insert en la base de datos", async () => {
    mockInsertSingle.mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });

    const res = await POST(makeRequest(validPayload()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No pudimos registrar el cobro.");
    expect(mockCreateFlowCheckout).not.toHaveBeenCalled();
  });

  it("responde 500 cuando el insert no retorna datos (sin error explícito)", async () => {
    mockInsertSingle.mockResolvedValue({ data: null, error: null });

    const res = await POST(makeRequest(validPayload()));
    expect(res.status).toBe(500);
    expect(mockCreateFlowCheckout).not.toHaveBeenCalled();
  });

  it("cuando Flow falla: marca el pago como failed y devuelve el error/status de Flow", async () => {
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
  });

  it("cuando falla el update de flow_token/flow_order, igual responde 200 (recuperable por cron)", async () => {
    mockUpdateEq.mockResolvedValue({ error: { message: "update failed" } });

    const res = await POST(makeRequest(validPayload()));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.paymentId).toBe("pay-1");
  });

  it("camino feliz: el update de flow_token/flow_order recibe token y flowOrder", async () => {
    const res = await POST(makeRequest(validPayload()));
    expect(res.status).toBe(200);
    expect(mockUpdatePayload).toHaveBeenCalledWith({
      flow_token: "tok-123",
      flow_order: 999,
    });
  });
});
