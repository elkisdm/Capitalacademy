import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => mockSend(...args) } }),
  FROM_EMAIL: "Capital Academy <no-reply@example.com>",
}));

const { sendInvitationEmail } = await import("@/lib/email/invitation");

function baseInput(
  overrides: Partial<Parameters<typeof sendInvitationEmail>[0]> = {},
) {
  return {
    email: "ana@example.com",
    fullName: "Ana Soto",
    inviteUrl: "https://capitalacademy.cl/auth/confirm?token=abc123",
    programName: "Diplomado 4ta Generación",
    cohortName: "Diplomado 4ta Generación — Mayo 2026",
    ...overrides,
  };
}

describe("sendInvitationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("camino feliz: envía con from/to/subject correctos y retorna success true", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendInvitationEmail(baseInput());

    expect(result).toEqual({ success: true });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [payload] = mockSend.mock.calls[0];
    expect(payload.from).toBe("Capital Academy <no-reply@example.com>");
    expect(payload.to).toBe("ana@example.com");
    expect(payload.subject).toBe(
      "Bienvenido a Capital Academy — Diplomado 4ta Generación",
    );
  });

  it("resend responde con error: retorna success false con el mensaje", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "invalid api key" } });

    const result = await sendInvitationEmail(baseInput());

    expect(result).toEqual({ success: false, error: "invalid api key" });
  });

  it("resend lanza una excepción Error: retorna success false con err.message", async () => {
    mockSend.mockRejectedValue(new Error("network down"));

    const result = await sendInvitationEmail(baseInput());

    expect(result).toEqual({ success: false, error: "network down" });
  });

  it("resend lanza un valor no-Error: retorna success false con 'unknown'", async () => {
    mockSend.mockRejectedValue("boom");

    const result = await sendInvitationEmail(baseInput());

    expect(result).toEqual({ success: false, error: "unknown" });
  });

  describe("courseLabel(): evita duplicar el programa cuando el cohort ya lo incluye", () => {
    it("cohort empieza con el nombre del programa: usa solo el cohort", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendInvitationEmail(
        baseInput({
          programName: "Workshop Inmobiliario",
          cohortName: "Workshop Inmobiliario — Mayo 2026",
        }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Workshop Inmobiliario — Mayo 2026");
      expect(payload.html).not.toContain(
        "Workshop Inmobiliario — Workshop Inmobiliario — Mayo 2026",
      );
      expect(payload.text).toContain(
        "Has sido inscrito en Workshop Inmobiliario — Mayo 2026.",
      );
    });

    it("comparación insensible a mayúsculas: también evita la duplicación", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendInvitationEmail(
        baseInput({
          programName: "workshop inmobiliario",
          cohortName: "WORKSHOP INMOBILIARIO — Mayo 2026",
        }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("WORKSHOP INMOBILIARIO — Mayo 2026");
    });

    it("cohort no incluye el programa como prefijo: concatena programa — cohort", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendInvitationEmail(
        baseInput({ programName: "Diplomado", cohortName: "G4" }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Diplomado — G4");
      expect(payload.text).toContain("Has sido inscrito en Diplomado — G4.");
    });

    it("sin programName: usa solo el cohortName", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendInvitationEmail(baseInput({ programName: "", cohortName: "G4" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.text).toContain("Has sido inscrito en G4.");
    });

    it("sin cohortName: usa solo el programName", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendInvitationEmail(baseInput({ programName: "Diplomado", cohortName: "" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.text).toContain("Has sido inscrito en Diplomado.");
    });
  });

  describe("saludo con primer nombre", () => {
    it("con fullName de varias palabras: saluda solo con el primer nombre", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendInvitationEmail(baseInput({ fullName: "Ana Sofía Soto Pérez" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("&iexcl;Bienvenido a Capital Academy, Ana!");
      expect(payload.text).toContain("¡Bienvenido a Capital Academy, Ana!");
    });
  });

  describe("inviteUrl", () => {
    it("aparece en el href del CTA (html) y en el texto plano", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendInvitationEmail(
        baseInput({ inviteUrl: "https://capitalacademy.cl/auth/confirm?token=abc123" }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain(
        'href="https://capitalacademy.cl/auth/confirm?token=abc123"',
      );
      expect(payload.text).toContain(
        "Crea tu contraseña: https://capitalacademy.cl/auth/confirm?token=abc123",
      );
    });
  });

  describe("esc(): escapa HTML solo en el cuerpo html", () => {
    it("escapa caracteres especiales en el nombre, el programa y el cohort", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendInvitationEmail(
        baseInput({
          fullName: `O'Brien`,
          programName: `Diplomado & Cía`,
          cohortName: `Diplomado & Cía — G4 "Elite"`,
        }),
      );

      const [payload] = mockSend.mock.calls[0];
      // El saludo solo usa el primer nombre (fullName.split(" ")[0]) escapado.
      expect(payload.html).toContain(
        "&iexcl;Bienvenido a Capital Academy, O&#39;Brien!",
      );
      expect(payload.html).toContain(
        "Diplomado &amp; Cía — G4 &quot;Elite&quot;",
      );
      // El texto plano no escapa: va tal cual.
      expect(payload.text).toContain(`Has sido inscrito en Diplomado & Cía — G4 "Elite".`);
    });

    it("escapa el inviteUrl en el href del botón CTA", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendInvitationEmail(
        baseInput({ inviteUrl: 'https://capitalacademy.cl/x?a=1&b="2"' }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain(
        'href="https://capitalacademy.cl/x?a=1&amp;b=&quot;2&quot;"',
      );
    });
  });

  it("incluye el pie de página fijo de la plataforma", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendInvitationEmail(baseInput());

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain("Capital Academy");
    expect(payload.html).toContain("capitalacademy.cl");
    expect(payload.text).toContain("Capital Academy · capitalacademy.cl");
  });
});
