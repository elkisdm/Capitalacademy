import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => mockSend(...args) } }),
  FROM_EMAIL: "Capital Academy <no-reply@example.com>",
}));

const { sendConversacionNotificationEmail } = await import(
  "@/lib/email/conversacion-notification"
);

function baseInput(
  overrides: Partial<Parameters<typeof sendConversacionNotificationEmail>[0]> = {},
) {
  return {
    to: "ana@example.com",
    recipientName: "Ana Soto",
    actorName: "Luis Perez",
    title: "¿Cómo se calcula la comisión?",
    kind: "reply" as const,
    url: "https://capitalacademy.cl/classroom/conversaciones/1",
    ...overrides,
  };
}

describe("sendConversacionNotificationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("camino feliz: envía con from/to correctos y retorna success true", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendConversacionNotificationEmail(baseInput());

    expect(result).toEqual({ success: true });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [payload] = mockSend.mock.calls[0];
    expect(payload.from).toBe("Capital Academy <no-reply@example.com>");
    expect(payload.to).toBe("ana@example.com");
  });

  it("resend responde con error: retorna success false con el mensaje", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "invalid api key" } });

    const result = await sendConversacionNotificationEmail(baseInput());

    expect(result).toEqual({ success: false, error: "invalid api key" });
  });

  it("resend lanza una excepción Error: retorna success false con err.message", async () => {
    mockSend.mockRejectedValue(new Error("network down"));

    const result = await sendConversacionNotificationEmail(baseInput());

    expect(result).toEqual({ success: false, error: "network down" });
  });

  it("resend lanza un valor no-Error: retorna success false con 'unknown'", async () => {
    mockSend.mockRejectedValue("boom");

    const result = await sendConversacionNotificationEmail(baseInput());

    expect(result).toEqual({ success: false, error: "unknown" });
  });

  describe("subject según kind", () => {
    it.each([
      ["reply", "Luis Perez respondió tu conversación"],
      ["mention", "Luis Perez te mencionó en una conversación"],
      ["lesson_reply", "Luis Perez respondió tu comentario en una lección"],
      ["lesson_comment_new", "Luis Perez comentó en tu lección"],
    ] as const)("kind=%s -> subject %s", async (kind, expectedSubject) => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendConversacionNotificationEmail(baseInput({ kind }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.subject).toBe(expectedSubject);
    });
  });

  describe("eyebrow (etiqueta superior) según kind", () => {
    it("mention -> 'Te mencionaron'", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });
      await sendConversacionNotificationEmail(baseInput({ kind: "mention" }));
      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Te mencionaron");
    });

    it("lesson_comment_new -> 'Nuevo comentario'", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });
      await sendConversacionNotificationEmail(baseInput({ kind: "lesson_comment_new" }));
      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Nuevo comentario");
    });

    it("reply -> 'Nueva respuesta' (rama por defecto)", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });
      await sendConversacionNotificationEmail(baseInput({ kind: "reply" }));
      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Nueva respuesta");
    });

    it("lesson_reply -> también 'Nueva respuesta'", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });
      await sendConversacionNotificationEmail(baseInput({ kind: "lesson_reply" }));
      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Nueva respuesta");
    });
  });

  describe("lead (texto introductorio) según kind", () => {
    it.each([
      ["mention", "Luis Perez te mencionó en la conversación:"],
      ["lesson_reply", "Luis Perez respondió tu comentario en la lección:"],
      ["lesson_comment_new", "Luis Perez comentó en tu lección:"],
      ["reply", "Luis Perez respondió tu conversación:"],
    ] as const)("kind=%s -> lead %s", async (kind, expectedLead) => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendConversacionNotificationEmail(baseInput({ kind }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain(expectedLead);
      expect(payload.text).toContain(expectedLead);
    });
  });

  describe("CTA (llamado a la acción) según kind", () => {
    it.each([
      ["reply", "Ver la conversación"],
      ["mention", "Ver la conversación"],
      ["lesson_reply", "Ver la lección"],
      ["lesson_comment_new", "Ver la lección"],
    ] as const)("kind=%s -> cta %s", async (kind, expectedCta) => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendConversacionNotificationEmail(baseInput({ kind }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain(`>${expectedCta}<`);
      expect(payload.text).toContain(`${expectedCta}: https://capitalacademy.cl/classroom/conversaciones/1`);
    });
  });

  describe("título de la tarjeta (title vs threadTitle deprecado)", () => {
    it("usa 'title' cuando está presente", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendConversacionNotificationEmail(
        baseInput({ title: "Título nuevo", threadTitle: "Título viejo" }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Título nuevo");
      expect(payload.html).not.toContain("Título viejo");
    });

    it("cae a 'threadTitle' cuando 'title' no está definido", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendConversacionNotificationEmail(
        baseInput({ title: undefined, threadTitle: "Título del hilo" }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Título del hilo");
    });

    it("usa cadena vacía cuando ni 'title' ni 'threadTitle' están definidos", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendConversacionNotificationEmail(
        baseInput({ title: undefined, threadTitle: undefined }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.text).toContain("Ver la conversación: https://capitalacademy.cl/classroom/conversaciones/1");
    });
  });

  describe("saludo con primer nombre", () => {
    it("con recipientName de varias palabras: usa solo el primer nombre", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendConversacionNotificationEmail(baseInput({ recipientName: "María José Fernández" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Hola, María 👋");
      expect(payload.text).toContain("Hola, María.");
    });

    it("con recipientName vacío: omite la coma y el nombre", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendConversacionNotificationEmail(baseInput({ recipientName: "" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Hola 👋");
      expect(payload.html).not.toContain("Hola, ");
      expect(payload.text).toContain("Hola.");
    });
  });

  it("escapa HTML en el título y en el actorName para prevenir inyección", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendConversacionNotificationEmail(
      baseInput({
        title: '<img src=x onerror=alert(1)>',
        actorName: '<script>alert("actor")</script>',
      }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(payload.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(payload.html).not.toContain('<script>alert("actor")</script>');
    expect(payload.html).toContain("&lt;script&gt;alert(&quot;actor&quot;)&lt;/script&gt;");
  });

  it("escapa el url en el href del botón CTA", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendConversacionNotificationEmail(
      baseInput({ url: 'https://capitalacademy.cl/x?a=1&b="2"' }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain('href="https://capitalacademy.cl/x?a=1&amp;b=&quot;2&quot;"');
  });

  it("incluye el pie de página fijo de la plataforma", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendConversacionNotificationEmail(baseInput());

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain("Capital Academy");
    expect(payload.html).toContain("capitalacademy.cl/classroom");
    expect(payload.text).toContain("Capital Academy · capitalacademy.cl/classroom");
  });
});
