import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => mockSend(...args) } }),
  FROM_EMAIL: "Capital Academy <no-reply@example.com>",
}));

const { sendAttendanceWarningEmail } = await import("@/lib/email/attendance-warning");

function baseInput(
  overrides: Partial<Parameters<typeof sendAttendanceWarningEmail>[0]> = {},
) {
  return {
    email: "ana@example.com",
    fullName: "Ana Soto",
    programId: null,
    cohortName: "G4",
    absencesCount: 2,
    maxAbsences: 3,
    ...overrides,
  };
}

describe("sendAttendanceWarningEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("camino feliz: envía con from/to/subject correctos y retorna success true", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendAttendanceWarningEmail(baseInput());

    expect(result).toEqual({ success: true });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [payload] = mockSend.mock.calls[0];
    expect(payload.from).toBe("Capital Academy <no-reply@example.com>");
    expect(payload.to).toBe("ana@example.com");
    expect(payload.subject).toBe("Capital Academy: seguimiento de tu asistencia");
  });

  it("resend responde con error: retorna success false con el mensaje", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "invalid api key" } });

    const result = await sendAttendanceWarningEmail(baseInput());

    expect(result).toEqual({ success: false, error: "invalid api key" });
  });

  it("resend lanza una excepción Error: retorna success false con err.message", async () => {
    mockSend.mockRejectedValue(new Error("network down"));

    const result = await sendAttendanceWarningEmail(baseInput());

    expect(result).toEqual({ success: false, error: "network down" });
  });

  it("resend lanza un valor no-Error: retorna success false con 'unknown'", async () => {
    mockSend.mockRejectedValue("boom");

    const result = await sendAttendanceWarningEmail(baseInput());

    expect(result).toEqual({ success: false, error: "unknown" });
  });

  describe("brand por programId", () => {
    it("programId null: usa la marca genérica Capital Academy", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendAttendanceWarningEmail(baseInput({ programId: null }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.subject).toBe("Capital Academy: seguimiento de tu asistencia");
      expect(payload.html).toContain("Plataforma educativa");
    });

    it("programId desconocido: cae a la marca genérica (degradación segura)", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendAttendanceWarningEmail(baseInput({ programId: "no-existe" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.subject).toBe("Capital Academy: seguimiento de tu asistencia");
    });

    it("programId de Liderazgo: brandea con el acento y el shortName de Liderazgo", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendAttendanceWarningEmail(
        baseInput({ programId: "a0000000-0000-0000-0000-000000000003" }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.subject).toBe("Programa de Liderazgo: seguimiento de tu asistencia");
      expect(payload.html).toContain("#f5a524");
      expect(payload.html).toContain("Liderazgo · Capital Academy");
    });
  });

  describe("cohortName: fila condicional", () => {
    it("con cohortName: agrega la fila 'Cohorte' en el html y la línea en el text", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendAttendanceWarningEmail(baseInput({ cohortName: "G4" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Cohorte");
      expect(payload.html).toContain("G4");
      expect(payload.text).toContain("Cohorte: G4");
    });

    it("cohortName null: omite la fila 'Cohorte' en el html y la línea en el text", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendAttendanceWarningEmail(baseInput({ cohortName: null }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).not.toContain(">Cohorte<");
      expect(payload.text).not.toContain("Cohorte:");
    });
  });

  describe("absencesCount / maxAbsences", () => {
    it("refleja el conteo de inasistencias y el máximo permitido en html y text", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendAttendanceWarningEmail(baseInput({ absencesCount: 4, maxAbsences: 5 }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Registramos 4 inasistencias");
      expect(payload.html).toContain("5 inasistencias");
      expect(payload.text).toContain("Registramos 4 inasistencias.");
      expect(payload.text).toContain("Máximo permitido: 5 inasistencias");
    });
  });

  describe("saludo con primer nombre", () => {
    it("fullName con varios nombres: saluda solo con el primer nombre", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendAttendanceWarningEmail(baseInput({ fullName: "Ana Sofía Soto Pérez" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Hola, Ana");
      expect(payload.text).toContain("Hola, Ana.");
    });

    it("fullName vacío: saluda sin nombre y sin coma", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendAttendanceWarningEmail(baseInput({ fullName: "" }));

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).toContain("Hola 👋");
      expect(payload.html).not.toContain("Hola,");
      expect(payload.text).toContain("Hola.");
      expect(payload.text).not.toContain("Hola,");
    });
  });

  describe("esc(): escapa HTML solo en el cuerpo html", () => {
    it("escapa caracteres especiales del cohortName en el html pero no en el text", async () => {
      mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

      await sendAttendanceWarningEmail(
        baseInput({ cohortName: `<script>alert("x")</script> & G4` }),
      );

      const [payload] = mockSend.mock.calls[0];
      expect(payload.html).not.toContain('<script>alert("x")</script>');
      expect(payload.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; G4");
      // El texto plano no escapa: va tal cual.
      expect(payload.text).toContain(`Cohorte: <script>alert("x")</script> & G4`);
    });
  });

  it("incluye el pie de página fijo y el CTA hacia el classroom", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendAttendanceWarningEmail(baseInput());

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain("Ir a mi classroom");
    expect(payload.html).toContain("capitalacademy.cl/classroom");
    expect(payload.text).toContain("Capital Academy · capitalacademy.cl/classroom");
  });
});
