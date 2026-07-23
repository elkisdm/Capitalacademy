import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => mockSend(...args) } }),
  FROM_EMAIL: "Capital Academy <no-reply@example.com>",
}));

const { sendDeliverableReceivedEmail } = await import("@/lib/email/deliverable-received");

function baseInput(
  overrides: Partial<Parameters<typeof sendDeliverableReceivedEmail>[0]> = {},
) {
  return {
    to: "ana@example.com",
    studentName: "Ana Soto",
    deliverableTitle: "Entregable 1: Plan de negocio",
    programName: "Diplomado 4ta Generación",
    fileName: "plan-negocio.pdf",
    submittedAt: "2026-07-24T15:00:00.000Z", // 11:00 hrs Chile
    url: "https://capitalacademy.cl/classroom/entregables/1",
    ...overrides,
  };
}

describe("sendDeliverableReceivedEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("camino feliz: envía con from/to/subject correctos y retorna success true", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendDeliverableReceivedEmail(baseInput());

    expect(result).toEqual({ success: true });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [payload] = mockSend.mock.calls[0];
    expect(payload.from).toBe("Capital Academy <no-reply@example.com>");
    expect(payload.to).toBe("ana@example.com");
    expect(payload.subject).toBe("Recibimos tu entrega: Entregable 1: Plan de negocio");
  });

  it("resend responde con error: retorna success false con el mensaje", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "invalid api key" } });

    const result = await sendDeliverableReceivedEmail(baseInput());

    expect(result).toEqual({ success: false, error: "invalid api key" });
  });

  it("resend lanza una excepción Error: retorna success false con err.message", async () => {
    mockSend.mockRejectedValue(new Error("network down"));

    const result = await sendDeliverableReceivedEmail(baseInput());

    expect(result).toEqual({ success: false, error: "network down" });
  });

  it("resend lanza un valor no-Error: retorna success false con 'unknown'", async () => {
    mockSend.mockRejectedValue("boom");

    const result = await sendDeliverableReceivedEmail(baseInput());

    expect(result).toEqual({ success: false, error: "unknown" });
  });

  describe("programName", () => {
    it("con programName definido: lo usa en el cuerpo", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendDeliverableReceivedEmail(baseInput({ programName: "Programa de Liderazgo" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Recibimos tu entrega en Programa de Liderazgo");
      expect(payload.text).toContain("Recibimos tu entrega en Programa de Liderazgo");
    });

    it("sin programName: cae al default 'Capital Academy'", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendDeliverableReceivedEmail(baseInput({ programName: undefined }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Recibimos tu entrega en Capital Academy");
      expect(payload.text).toContain("Recibimos tu entrega en Capital Academy");
    });
  });

  describe("url del CTA", () => {
    it("con url definida: la usa en el botón y en el texto plano", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendDeliverableReceivedEmail(
        baseInput({ url: "https://capitalacademy.cl/classroom/entregables/1" }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain(
        'href="https://capitalacademy.cl/classroom/entregables/1"',
      );
      expect(payload.text).toContain(
        "Ver en la plataforma: https://capitalacademy.cl/classroom/entregables/1",
      );
    });

    it("sin url: cae al link por defecto de la plataforma (/classroom)", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendDeliverableReceivedEmail(baseInput({ url: undefined }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain('href="https://capitalacademy.cl/classroom"');
      expect(payload.text).toContain("Ver en la plataforma: https://capitalacademy.cl/classroom");
    });
  });

  describe("fileName: fila/línea 'Archivo' condicional", () => {
    it("con fileName: aparece la fila 'Archivo' en html y la línea en text", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendDeliverableReceivedEmail(baseInput({ fileName: "plan-negocio.pdf" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Archivo");
      expect(payload.html).toContain("plan-negocio.pdf");
      expect(payload.text).toContain("Archivo: plan-negocio.pdf");
    });

    it("sin fileName: omite la fila 'Archivo' en html y la línea en text", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendDeliverableReceivedEmail(baseInput({ fileName: undefined }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).not.toContain(">Archivo<");
      expect(payload.text).not.toContain("Archivo:");
    });
  });

  describe("saludo con primer nombre", () => {
    it("con studentName de varias palabras: saluda solo con el primer nombre", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendDeliverableReceivedEmail(baseInput({ studentName: "Ana Sofía Soto Pérez" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Hola, Ana 👋");
      expect(payload.text).toContain("Hola, Ana.");
    });

    it("studentName vacío: saluda sin nombre y sin coma", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendDeliverableReceivedEmail(baseInput({ studentName: "" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Hola 👋");
      expect(payload.html).not.toContain("Hola,");
      expect(payload.text).toContain("Hola.");
      expect(payload.text).not.toContain("Hola,");
    });
  });

  describe("fecha de recepción: formato es-CL / America/Santiago", () => {
    it("formatea la fecha y hora, con la anotación '(Chile)'", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendDeliverableReceivedEmail(
        baseInput({ submittedAt: "2026-07-24T15:00:00.000Z" }), // 11:00 hrs Chile
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("viernes, 24 de julio, 11:00");
      expect(payload.html).toContain("(Chile)");
      expect(payload.text).toContain("Recibido: viernes, 24 de julio, 11:00 (Chile)");
    });
  });

  describe("esc(): escapa HTML solo en el cuerpo html", () => {
    it("escapa caracteres especiales en el título, el nombre y el programa", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendDeliverableReceivedEmail(
        baseInput({
          deliverableTitle: `<script>alert("x")</script> & Tips`,
          studentName: `O'Brien <b>Jefe</b>`,
          programName: `Diplomado & Cía`,
        }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).not.toContain('<script>alert("x")</script>');
      expect(payload.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Tips");
      // El saludo solo usa el primer nombre (firstNameOf toma el primer token).
      expect(payload.html).toContain("Hola, O&#39;Brien 👋");
      expect(payload.html).toContain("Diplomado &amp; Cía");
      // El texto plano no escapa: va tal cual.
      expect(payload.text).toContain(`Entregable: <script>alert("x")</script> & Tips`);
    });

    it("escapa el url en el href del botón CTA", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendDeliverableReceivedEmail(
        baseInput({ url: 'https://capitalacademy.cl/x?a=1&b="2"' }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain('href="https://capitalacademy.cl/x?a=1&amp;b=&quot;2&quot;"');
    });
  });

  it("incluye el pie de página fijo de la plataforma", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendDeliverableReceivedEmail(baseInput());

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain("Capital Academy");
    expect(payload.html).toContain("capitalacademy.cl/classroom");
    expect(payload.text).toContain("Capital Academy · capitalacademy.cl/classroom");
  });
});
