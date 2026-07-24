import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => mockSend(...args) } }),
  FROM_EMAIL: "Capital Academy <no-reply@example.com>",
}));

const {
  sendCapacitacionConfirmationEmail,
  buildCapacitacionReminderEmail,
  buildCapacitacionFollowupEmail,
} = await import("@/lib/email/capacitacion-emails");

describe("sendCapacitacionConfirmationEmail", () => {
  function baseInput(
    overrides: Partial<Parameters<typeof sendCapacitacionConfirmationEmail>[0]> = {},
  ) {
    return {
      email: "ana@example.com",
      fullName: "Ana Soto",
      sessionTitle: "Fundamentos de venta inmobiliaria",
      startsAtIso: "2026-07-23T15:00:00.000Z",
      endsAtIso: "2026-07-23T17:00:00.000Z",
      modality: "live_online" as string,
      meetingUrl: "https://meet.example.com/sala-1",
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("camino feliz (online con meetingUrl): envía con subject, CTA y programa por defecto", async () => {
    mockSend.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const result = await sendCapacitacionConfirmationEmail(baseInput());

    expect(result).toEqual({ success: true });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [payload] = mockSend.mock.calls[0];
    expect(payload.to).toBe("ana@example.com");
    expect(payload.from).toBe("Capital Academy <no-reply@example.com>");
    expect(payload.subject).toBe(
      "Inscripción confirmada · Fundamentos de venta inmobiliaria",
    );
    // Fallback neutro cuando no se pasa programName.
    expect(payload.html).toContain("Capital Academy");
    expect(payload.html).toContain("Guardar el enlace de la clase");
    expect(payload.html).toContain("https://meet.example.com/sala-1");
    expect(payload.html).toContain("El enlace de conexión es el mismo botón de arriba");
    expect(payload.text).toContain("Enlace de conexión: https://meet.example.com/sala-1");
  });

  it("programName personalizado: reemplaza el fallback neutro en html y text", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendCapacitacionConfirmationEmail(
      baseInput({ programName: "Ciclo de Capacitación Comercial CI" }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain(
      "Tu cupo en Ciclo de Capacitación Comercial CI quedó confirmado",
    );
    expect(payload.text).toContain(
      "Tu cupo en Ciclo de Capacitación Comercial CI quedó confirmado",
    );
  });

  it("online sin meetingUrl: omite el CTA y usa la nota de 'enlace en recordatorios'", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendCapacitacionConfirmationEmail(
      baseInput({ modality: "live_online", meetingUrl: null }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).not.toContain("Guardar el enlace de la clase");
    expect(payload.html).toContain(
      "Te enviaremos el enlace de conexión en los recordatorios previos.",
    );
    expect(payload.text).toContain(
      "Te enviaremos el enlace de conexión en los recordatorios previos.",
    );
  });

  it("presencial: omite el CTA y muestra la nota de ubicación en el calendario", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendCapacitacionConfirmationEmail(
      baseInput({ modality: "live_in_person", meetingUrl: null }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).not.toContain("Guardar el enlace de la clase");
    expect(payload.html).toContain("Esta clase es presencial");
    expect(payload.html).toContain(">Presencial<");
    expect(payload.text).toContain("Modalidad: Presencial");
    expect(payload.text).toContain("Clase presencial. Revisa la ubicación");
  });

  it("modalidad 'recorded': muestra la etiqueta 'Grabada' y una nota de grabación (no 'presencial')", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendCapacitacionConfirmationEmail(
      baseInput({ modality: "recorded", meetingUrl: null }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain(">Grabada<");
    expect(payload.html).not.toContain("Esta clase es presencial");
    expect(payload.html).toContain("Esta clase es grabada");
    expect(payload.text).toContain("Modalidad: Grabada");
    expect(payload.text).not.toContain("Clase presencial");
    expect(payload.text).toContain("Clase grabada. Podrás verla en la plataforma");
  });

  it("escapa HTML del nombre y del título de la sesión (previene inyección)", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendCapacitacionConfirmationEmail(
      baseInput({
        fullName: "<script>alert(1)</script>",
        sessionTitle: "<img src=x onerror=alert(2)>",
      }),
    );

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).not.toContain("<script>alert(1)</script>");
    expect(payload.html).not.toContain("<img src=x onerror=alert(2)>");
    expect(payload.html).toContain("&lt;script&gt;");
    expect(payload.html).toContain("&lt;img src=x onerror=alert(2)&gt;");
    // El texto plano no escapa (no es HTML).
    expect(payload.text).toContain("<img src=x onerror=alert(2)>");
  });

  it("fullName vacío: el saludo no agrega coma ni nombre", async () => {
    mockSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await sendCapacitacionConfirmationEmail(baseInput({ fullName: "" }));

    const [payload] = mockSend.mock.calls[0];
    expect(payload.html).toContain("Hola 👋");
    expect(payload.html).not.toContain("Hola,");
    expect(payload.text.startsWith("Hola.")).toBe(true);
  });

  it("resend responde con error: retorna success false con el mensaje", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "invalid api key" } });

    const result = await sendCapacitacionConfirmationEmail(baseInput());

    expect(result).toEqual({ success: false, error: "invalid api key" });
  });

  it("resend lanza una excepción Error: retorna success false con err.message", async () => {
    mockSend.mockRejectedValue(new Error("network down"));

    const result = await sendCapacitacionConfirmationEmail(baseInput());

    expect(result).toEqual({ success: false, error: "network down" });
  });

  it("resend lanza un valor no-Error: retorna success false con 'unknown'", async () => {
    mockSend.mockRejectedValue("boom");

    const result = await sendCapacitacionConfirmationEmail(baseInput());

    expect(result).toEqual({ success: false, error: "unknown" });
  });
});

describe("buildCapacitacionReminderEmail", () => {
  function baseInput(
    overrides: Partial<Parameters<typeof buildCapacitacionReminderEmail>[0]> = {},
  ) {
    return {
      email: "ana@example.com",
      fullName: "Ana Soto",
      sessionTitle: "Fundamentos de venta inmobiliaria",
      startsAtIso: "2026-07-23T15:00:00.000Z",
      endsAtIso: "2026-07-23T17:00:00.000Z",
      modality: "live_online" as string,
      meetingUrl: "https://meet.example.com/sala-1",
      kind: "24h" as const,
      ...overrides,
    };
  }

  it("kind '24h': subject dice 'Mañana' y el lead menciona 'es mañana'", () => {
    const content = buildCapacitacionReminderEmail(baseInput({ kind: "24h" }));

    expect(content.subject).toBe(
      "Recordatorio: Mañana tienes Fundamentos de venta inmobiliaria",
    );
    expect(content.html).toContain("Tu capacitación es mañana");
    expect(content.text).toContain("Tu capacitación es mañana");
  });

  it("kind '72h': subject dice 'En 3 días' y el lead menciona 'es en 3 días'", () => {
    const content = buildCapacitacionReminderEmail(baseInput({ kind: "72h" }));

    expect(content.subject).toBe(
      "Recordatorio: En 3 días tienes Fundamentos de venta inmobiliaria",
    );
    expect(content.html).toContain("Tu capacitación es en 3 días");
    expect(content.text).toContain("Tu capacitación es en 3 días");
  });

  it("kind '1h': subject dice 'Hoy' y el lead menciona 'en aproximadamente 1 hora'", () => {
    const content = buildCapacitacionReminderEmail(baseInput({ kind: "1h" }));

    expect(content.subject).toBe(
      "Recordatorio: Hoy tienes Fundamentos de venta inmobiliaria",
    );
    expect(content.html).toContain("comienza en aproximadamente 1 hora");
    expect(content.text).toContain("comienza en aproximadamente 1 hora");
  });

  it("online con meetingUrl: agrega el CTA 'Unirme a la clase' con el enlace directo", () => {
    const content = buildCapacitacionReminderEmail(
      baseInput({ modality: "live_online", meetingUrl: "https://meet.example.com/sala-2" }),
    );

    expect(content.html).toContain("Unirme a la clase");
    expect(content.html).toContain("https://meet.example.com/sala-2");
    expect(content.html).toContain("El botón te lleva directo a la sala");
    expect(content.text).toContain("Enlace de conexión: https://meet.example.com/sala-2");
  });

  it("online sin meetingUrl: omite el CTA y avisa que el enlace estará en el calendario", () => {
    const content = buildCapacitacionReminderEmail(
      baseInput({ modality: "live_online", meetingUrl: null }),
    );

    expect(content.html).not.toContain("Unirme a la clase");
    expect(content.html).toContain(
      "El enlace de conexión estará disponible en tu calendario",
    );
    expect(content.text).toContain(
      "El enlace de conexión estará disponible en tu calendario",
    );
  });

  it("presencial: omite el CTA y avisa ubicación/materiales en el calendario", () => {
    const content = buildCapacitacionReminderEmail(
      baseInput({ modality: "live_in_person", meetingUrl: null }),
    );

    expect(content.html).not.toContain("Unirme a la clase");
    expect(content.html).toContain("Esta clase es presencial");
    expect(content.text).toContain("Clase presencial. Revisa la ubicación y materiales");
  });

  it("modalidad 'recorded': muestra la etiqueta 'Grabada' y una nota de grabación (no 'presencial')", () => {
    const content = buildCapacitacionReminderEmail(
      baseInput({ modality: "recorded", meetingUrl: null }),
    );

    expect(content.html).toContain(">Grabada<");
    expect(content.html).not.toContain("Esta clase es presencial");
    expect(content.html).toContain("Esta clase es grabada");
    expect(content.text).toContain("Modalidad: Grabada");
    expect(content.text).not.toContain("Clase presencial");
    expect(content.text).toContain("Clase grabada. Podrás verla en la plataforma");
  });

  it("escapa HTML del título de la sesión en el subject renderizado en html", () => {
    const content = buildCapacitacionReminderEmail(
      baseInput({ sessionTitle: "<b>Clase</b>" }),
    );

    expect(content.html).not.toContain("<b>Clase</b>");
    expect(content.html).toContain("&lt;b&gt;Clase&lt;/b&gt;");
  });

  it("modalidad desconocida: modalityLabel cae al default y muestra el valor crudo", () => {
    const content = buildCapacitacionReminderEmail(baseInput({ modality: "hibrida" }));

    expect(content.html).toContain(">hibrida<");
    expect(content.text).toContain("Modalidad: hibrida");
    // No es 'live_online', así que isOnline() la trata como no-online.
    expect(content.html).toContain("Esta clase es presencial");
  });
});

describe("buildCapacitacionFollowupEmail", () => {
  function baseInput(
    overrides: Partial<Parameters<typeof buildCapacitacionFollowupEmail>[0]> = {},
  ) {
    return {
      email: "ana@example.com",
      fullName: "Ana Soto",
      sessionTitle: "Fundamentos de venta inmobiliaria",
      recordingUrl: "https://academy.example.com/classroom/lecciones/abc",
      programCtaUrl: "https://academy.example.com/diplomado",
      programCtaLabel: "Conoce el Diplomado",
      ...overrides,
    };
  }

  it("camino feliz: subject, grabación y CTA de programa con el fallback neutro", () => {
    const content = buildCapacitacionFollowupEmail(baseInput());

    expect(content.subject).toBe(
      "Ya está disponible la grabación de Fundamentos de venta inmobiliaria",
    );
    expect(content.html).toContain("Grabación disponible");
    expect(content.html).toContain("Ver la grabación");
    expect(content.html).toContain("https://academy.example.com/classroom/lecciones/abc");
    expect(content.html).toContain("Conoce el Diplomado");
    expect(content.html).toContain("https://academy.example.com/diplomado");
    // Fallback neutro cuando no se pasa programName.
    expect(content.html).toContain("Capital Academy es el siguiente paso");
    expect(content.text).toContain("Ver la grabación: https://academy.example.com/classroom/lecciones/abc");
    expect(content.text).toContain("Conoce el Diplomado: https://academy.example.com/diplomado");
  });

  it("programName personalizado: reemplaza el fallback neutro en la nota y el text", () => {
    const content = buildCapacitacionFollowupEmail(
      baseInput({ programName: "Programa de Liderazgo" }),
    );

    expect(content.html).toContain("Programa de Liderazgo es el siguiente paso");
    expect(content.text).toContain("¿Quieres profundizar? Programa de Liderazgo es el siguiente paso.");
  });

  it("escapa HTML del nombre, del título de sesión y de la etiqueta del CTA", () => {
    const content = buildCapacitacionFollowupEmail(
      baseInput({
        fullName: "<script>x</script>",
        sessionTitle: "<i>Clase</i>",
        programCtaLabel: "<b>Ir</b>",
      }),
    );

    expect(content.html).not.toContain("<script>x</script>");
    expect(content.html).not.toContain("<i>Clase</i>");
    expect(content.html).not.toContain("<b>Ir</b>");
    expect(content.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(content.html).toContain("&lt;i&gt;Clase&lt;/i&gt;");
    expect(content.html).toContain("&lt;b&gt;Ir&lt;/b&gt;");
  });

  it("fullName vacío: el saludo en texto plano no agrega coma ni nombre", () => {
    const content = buildCapacitacionFollowupEmail(baseInput({ fullName: "" }));

    expect(content.text.startsWith("Hola.")).toBe(true);
  });
});
