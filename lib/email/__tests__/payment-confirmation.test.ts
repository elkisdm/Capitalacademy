import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSend = vi.fn();

vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => mockSend(...args) } }),
  FROM_EMAIL: "Capital Academy <no-reply@example.com>",
}));

const {
  sendPaymentConfirmationEmail,
  sendPaymentTeamNotification,
  sendEnrollmentFailureNotification,
} = await import("@/lib/email/payment-confirmation");

function baseInput(overrides: Partial<Parameters<typeof sendPaymentConfirmationEmail>[0]> = {}) {
  return {
    paymentId: "pay_123",
    firstname: "Ana",
    lastname: "Soto",
    email: "ana@example.com",
    rut: "111111111",
    phone: "+56911111111",
    amountClp: 100_000,
    paidAt: new Date("2026-07-20T15:00:00.000Z"),
    plan: "contado" as string | null,
    couponCode: null as string | null,
    discountClp: null as number | null,
    documentType: null as string | null,
    invoiceData: null as Record<string, string> | null,
    ...overrides,
  };
}

describe("sendPaymentConfirmationEmail", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    }
  });

  it("camino feliz: retorna ok true con el id de resend", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendPaymentConfirmationEmail(baseInput());

    expect(result).toEqual({ ok: true, id: "email_1" });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [payload] = mockSend.mock.calls[0];
    expect(payload.to).toBe("ana@example.com");
    expect(payload.from).toBe("Capital Academy <no-reply@example.com>");
  });

  it("retorna id vacío si resend no incluye data.id", async () => {
    mockSend.mockResolvedValue({ data: null, error: null });

    const result = await sendPaymentConfirmationEmail(baseInput());

    expect(result).toEqual({ ok: true, id: "" });
  });

  it("resend responde con error: retorna ok false con el mensaje", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "invalid api key" } });

    const result = await sendPaymentConfirmationEmail(baseInput());

    expect(result).toEqual({ ok: false, error: "invalid api key" });
  });

  it("resend lanza una excepción Error: retorna ok false con err.message", async () => {
    mockSend.mockRejectedValue(new Error("network down"));

    const result = await sendPaymentConfirmationEmail(baseInput());

    expect(result).toEqual({ ok: false, error: "network down" });
  });

  it("resend lanza un valor no-Error: retorna ok false con 'unknown'", async () => {
    mockSend.mockRejectedValue("boom");

    const result = await sendPaymentConfirmationEmail(baseInput());

    expect(result).toEqual({ ok: false, error: "unknown" });
  });

  it("plan del Diplomado: subject y html usan el programa Diplomado", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendPaymentConfirmationEmail(baseInput({ plan: "contado" }));

    const [payload] = mockSend.mock.calls[0];
    expect(payload.subject).toContain("Diplomado");
    expect(payload.html).toContain("Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria");
    expect(payload.text).toContain("Diplomado Ejecutivo en Ventas y Asesoría Inmobiliaria");
    expect(payload.html).toContain("Pago contado");
  });

  it("plan de Liderazgo: subject y html usan el programa de Liderazgo", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendPaymentConfirmationEmail(baseInput({ plan: "lid-contado" }));

    const [payload] = mockSend.mock.calls[0];
    expect(payload.subject).toContain("Programa de Liderazgo");
    expect(payload.html).toContain("Programa de Liderazgo y Gestión de Equipos Comerciales");
  });

  it("plan null (pago legacy): usa el fallback neutro 'Capital Academy' y omite la fila de forma de pago", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendPaymentConfirmationEmail(baseInput({ plan: null }));

    const [payload] = mockSend.mock.calls[0];
    expect(payload.subject).toContain("Capital Academy");
    expect(payload.html).not.toContain("Forma de pago");
    expect(payload.text).not.toContain("Forma de pago:");
  });

  it("plan desconocido (no matchea ningún programa): fallback neutro y planLabel null", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendPaymentConfirmationEmail(baseInput({ plan: "plan-inexistente" }));

    const [payload] = mockSend.mock.calls[0];
    expect(payload.subject).toContain("Capital Academy");
    expect(payload.html).not.toContain("Forma de pago");
  });

  it("con cupón y descuento > 0: muestra la fila de cupón con el monto formateado", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendPaymentConfirmationEmail(
      baseInput({ couponCode: "LANZAMIENTO10", discountClp: 15_000 }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain("LANZAMIENTO10");
    expect(payload.html).toContain("$15.000");
    expect(payload.text).toContain("Cupón aplicado: LANZAMIENTO10");
  });

  it("con cupón pero descuento 0: NO muestra la fila de cupón", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendPaymentConfirmationEmail(
      baseInput({ couponCode: "LANZAMIENTO10", discountClp: 0 }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).not.toContain("LANZAMIENTO10");
  });

  it("sin cupón (couponCode null): NO muestra la fila de cupón", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendPaymentConfirmationEmail(baseInput({ couponCode: null, discountClp: 15_000 }));

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).not.toContain("−$15.000");
  });

  it("escapa HTML en campos del usuario para prevenir inyección", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendPaymentConfirmationEmail(
      baseInput({ firstname: "<script>alert(1)</script>" }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).not.toContain("<script>alert(1)</script>");
    expect(payload.html).toContain("&lt;script&gt;");
    // El texto plano no debe escapar (no es HTML).
    expect(payload.text).toContain("<script>alert(1)</script>");
  });

  it("getPublicBaseUrl: usa el fallback de producción cuando NEXT_PUBLIC_APP_URL apunta a localhost", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendPaymentConfirmationEmail(baseInput());

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain("https://capitalacademy.cl/email/logo-on-light.png");
  });

  it("getPublicBaseUrl: usa el fallback de producción cuando NEXT_PUBLIC_APP_URL no está configurada", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendPaymentConfirmationEmail(baseInput());

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain("https://capitalacademy.cl/email/logo-on-light.png");
  });

  it("getPublicBaseUrl: usa el dominio configurado y le quita la barra final", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.capitalacademy.cl/";
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendPaymentConfirmationEmail(baseInput());

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain("https://staging.capitalacademy.cl/email/logo-on-light.png");
  });
});

describe("sendPaymentTeamNotification", () => {
  const originalRecipient = process.env.TEAM_NOTIFICATION_EMAIL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TEAM_NOTIFICATION_EMAIL = "equipo@capitalacademy.cl";
  });

  afterEach(() => {
    if (originalRecipient === undefined) {
      delete process.env.TEAM_NOTIFICATION_EMAIL;
    } else {
      process.env.TEAM_NOTIFICATION_EMAIL = originalRecipient;
    }
  });

  it("sin TEAM_NOTIFICATION_EMAIL configurado: no envía nada y retorna ok false", async () => {
    delete process.env.TEAM_NOTIFICATION_EMAIL;

    const result = await sendPaymentTeamNotification(baseInput());

    expect(result).toEqual({
      ok: false,
      error: "TEAM_NOTIFICATION_EMAIL not configured",
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("camino feliz: envía al recipient configurado con replyTo del alumno", async () => {
    mockSend.mockResolvedValue({ data: { id: "team_1" }, error: null });

    const result = await sendPaymentTeamNotification(baseInput());

    expect(result).toEqual({ ok: true, id: "team_1" });
    const [payload] = mockSend.mock.calls[0];
    expect(payload.to).toBe("equipo@capitalacademy.cl");
    expect(payload.replyTo).toBe("ana@example.com");
    expect(payload.subject).not.toContain("FACTURA");
  });

  it("documentType factura: agrega el sufijo FACTURA al subject y los datos de facturación al html/text", async () => {
    mockSend.mockResolvedValue({ data: { id: "team_1" }, error: null });

    await sendPaymentTeamNotification(
      baseInput({
        documentType: "factura",
        invoiceData: {
          razonSocial: "Inmobiliaria Sur SpA",
          rut: "765432105",
          giro: "Corretaje",
          direccion: "Av. Siempre Viva 123",
          comuna: "Providencia",
          email: "facturacion@inmobiliariasur.cl",
        },
      }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.subject).toContain("FACTURA");
    expect(payload.html).toContain("Inmobiliaria Sur SpA");
    expect(payload.html).toContain("Providencia");
    expect(payload.html).toContain("facturacion@inmobiliariasur.cl");
    // El RUT se formatea con puntos y guion.
    expect(payload.html).toContain("76.543.210-5");
    expect(payload.text).toContain("Razón social: Inmobiliaria Sur SpA");
    expect(payload.text).toContain("Email facturación: facturacion@inmobiliariasur.cl");
  });

  it("documentType factura sin email de facturación: omite la fila de email en html/text", async () => {
    mockSend.mockResolvedValue({ data: { id: "team_1" }, error: null });

    await sendPaymentTeamNotification(
      baseInput({
        documentType: "factura",
        invoiceData: {
          razonSocial: "Inmobiliaria Sur SpA",
          rut: "765432105",
          giro: "Corretaje",
          direccion: "Av. Siempre Viva 123",
          comuna: "Providencia",
        },
      }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).not.toContain("Email facturación");
    expect(payload.text).not.toContain("Email facturación");
  });

  it("documentType factura pero sin invoiceData: NO muestra el bloque de factura", async () => {
    mockSend.mockResolvedValue({ data: { id: "team_1" }, error: null });

    await sendPaymentTeamNotification(
      baseInput({ documentType: "factura", invoiceData: null }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).not.toContain("Datos de factura");
    // El subject sí marca FACTURA porque solo depende de documentType.
    expect(payload.subject).toContain("FACTURA");
  });

  it("resend responde con error: retorna ok false con el mensaje", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "rate limited" } });

    const result = await sendPaymentTeamNotification(baseInput());

    expect(result).toEqual({ ok: false, error: "rate limited" });
  });

  it("resend lanza una excepción: retorna ok false con err.message", async () => {
    mockSend.mockRejectedValue(new Error("timeout"));

    const result = await sendPaymentTeamNotification(baseInput());

    expect(result).toEqual({ ok: false, error: "timeout" });
  });

  it("resend lanza un valor no-Error: retorna ok false con 'unknown'", async () => {
    mockSend.mockRejectedValue({ weird: true });

    const result = await sendPaymentTeamNotification(baseInput());

    expect(result).toEqual({ ok: false, error: "unknown" });
  });

  it("con cupón y descuento: la notificación al equipo también muestra la fila de cupón", async () => {
    mockSend.mockResolvedValue({ data: { id: "team_1" }, error: null });

    await sendPaymentTeamNotification(
      baseInput({ couponCode: "PROMO5", discountClp: 5_000 }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain("PROMO5");
    expect(payload.text).toContain("Cupón: PROMO5");
  });
});

describe("sendEnrollmentFailureNotification", () => {
  const originalRecipient = process.env.TEAM_NOTIFICATION_EMAIL;

  function baseFailureInput(
    overrides: Partial<Parameters<typeof sendEnrollmentFailureNotification>[0]> = {},
  ) {
    return {
      paymentId: "pay_999",
      firstname: "Luis",
      lastname: "Perez",
      email: "luis@example.com",
      amountClp: 200_000,
      plan: "contado" as string | null,
      attempts: 1,
      exhausted: false,
      error: "insert failed: duplicate key",
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TEAM_NOTIFICATION_EMAIL = "equipo@capitalacademy.cl";
  });

  afterEach(() => {
    if (originalRecipient === undefined) {
      delete process.env.TEAM_NOTIFICATION_EMAIL;
    } else {
      process.env.TEAM_NOTIFICATION_EMAIL = originalRecipient;
    }
  });

  it("sin TEAM_NOTIFICATION_EMAIL configurado: no envía nada y retorna ok false", async () => {
    delete process.env.TEAM_NOTIFICATION_EMAIL;

    const result = await sendEnrollmentFailureNotification(baseFailureInput());

    expect(result).toEqual({
      ok: false,
      error: "TEAM_NOTIFICATION_EMAIL not configured",
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("reintentos NO agotados: tag 'reintentando' y menciona el cron flow-reconcile", async () => {
    mockSend.mockResolvedValue({ data: { id: "fail_1" }, error: null });

    const result = await sendEnrollmentFailureNotification(
      baseFailureInput({ exhausted: false, attempts: 2 }),
    );

    expect(result).toEqual({ ok: true, id: "fail_1" });
    const [payload] = mockSend.mock.calls[0];
    expect(payload.subject).toContain("reintentando");
    expect(payload.subject).not.toContain("ACCIÓN MANUAL");
    expect(payload.text).toContain("flow-reconcile reintentará automáticamente");
    expect(payload.text).not.toContain("Se agotaron los reintentos");
  });

  it("reintentos agotados: tag 'ACCIÓN MANUAL' e instrucciones de matrícula manual", async () => {
    mockSend.mockResolvedValue({ data: { id: "fail_1" }, error: null });

    const result = await sendEnrollmentFailureNotification(
      baseFailureInput({ exhausted: true, attempts: 5 }),
    );

    expect(result).toEqual({ ok: true, id: "fail_1" });
    const [payload] = mockSend.mock.calls[0];
    expect(payload.subject).toContain("ACCIÓN MANUAL");
    expect(payload.text).toContain("Se agotaron los reintentos automáticos");
    expect(payload.text).toContain("reintentos agotados");
  });

  it("plan null: muestra un guion como plan en el cuerpo del correo", async () => {
    mockSend.mockResolvedValue({ data: { id: "fail_1" }, error: null });

    await sendEnrollmentFailureNotification(baseFailureInput({ plan: null }));

    const [payload] = mockSend.mock.calls[0];
    expect(payload.text).toContain("Plan: —");
  });

  it("escapa HTML del bloque <pre> para que el error del proveedor no inyecte markup", async () => {
    mockSend.mockResolvedValue({ data: { id: "fail_1" }, error: null });

    await sendEnrollmentFailureNotification(
      baseFailureInput({ error: "<img src=x onerror=alert(1)>" }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(payload.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("resend responde con error: retorna ok false con el mensaje", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "invalid recipient" } });

    const result = await sendEnrollmentFailureNotification(baseFailureInput());

    expect(result).toEqual({ ok: false, error: "invalid recipient" });
  });

  it("resend lanza una excepción: retorna ok false con err.message", async () => {
    mockSend.mockRejectedValue(new Error("dns failure"));

    const result = await sendEnrollmentFailureNotification(baseFailureInput());

    expect(result).toEqual({ ok: false, error: "dns failure" });
  });

  it("resend lanza un valor no-Error: retorna ok false con 'unknown'", async () => {
    mockSend.mockRejectedValue(42);

    const result = await sendEnrollmentFailureNotification(baseFailureInput());

    expect(result).toEqual({ ok: false, error: "unknown" });
  });

  it("retorna id vacío si resend no incluye data.id", async () => {
    mockSend.mockResolvedValue({ data: null, error: null });

    const result = await sendEnrollmentFailureNotification(baseFailureInput());

    expect(result).toEqual({ ok: true, id: "" });
  });
});
