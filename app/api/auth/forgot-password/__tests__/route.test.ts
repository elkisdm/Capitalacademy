import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────
// Los limitadores de tasa (`perIpLimiter`, `perEmailLimiter`) son singletons
// creados al importar el módulo: su Map interno persiste entre tests dentro
// de este archivo. Por eso cada test usa una IP y/o un email únicos (salvo
// los que prueban explícitamente el límite), para no contaminarse entre sí.

let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

let emailCounter = 0;
function nextEmail() {
  emailCounter += 1;
  return `alumno${emailCounter}@test.cl`;
}

function makeRequest(payload: unknown, ip = nextIp()) {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(payload),
  });
}

function makeInvalidJsonRequest(ip = nextIp()) {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: "esto-no-es-json{",
  });
}

// ── Mutable mock state ────────────────────────────────────────

const mockGenerateLink = vi.fn();
const mockSend = vi.fn();
/** Filas escritas en `access_email_log` durante el test (ver 0082). */
const mockLogInsert = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { generateLink: (...args: unknown[]) => mockGenerateLink(...args) } },
    from: (table: string) => ({
      insert: (row: unknown) => {
        mockLogInsert(table, row);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => mockSend(...args) } }),
  FROM_EMAIL: "Capital Academy <no-reply@example.com>",
}));

vi.mock("@/lib/api/base-url", () => ({
  getPublicBaseUrl: () => "https://capitalacademy.cl",
}));

// ── Import handler (DESPUÉS de los mocks) ─────────────────────

const { POST } = await import("@/app/api/auth/forgot-password/route");

beforeEach(() => {
  vi.clearAllMocks();
  mockGenerateLink.mockResolvedValue({
    data: { properties: { hashed_token: "tok_abc123" }, user: { id: "user-1" } },
    error: null,
  });
  mockSend.mockResolvedValue({ data: { id: "email_1" }, error: null });
});

/** Última fila registrada en la bitácora de correos de acceso. */
function lastLoggedRow() {
  const calls = mockLogInsert.mock.calls.filter(([table]) => table === "access_email_log");
  return calls.at(-1)?.[1] as Record<string, unknown> | undefined;
}

describe("POST /api/auth/forgot-password", () => {
  it("responde 400 cuando el body no se puede parsear como JSON", async () => {
    const res = await POST(makeInvalidJsonRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Body inválido");
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it("responde 422 cuando falta el email", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Email es requerido");
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it("responde 422 cuando el email no es un string", async () => {
    const res = await POST(makeRequest({ email: 12345 }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Email es requerido");
  });

  it("responde 422 cuando el email es un string vacío", async () => {
    const res = await POST(makeRequest({ email: "" }));
    expect(res.status).toBe(422);
  });

  it("responde 429 y no llama a generateLink cuando se supera el límite por IP (30 en la ventana)", async () => {
    const ip = "10.0.0.200";
    for (let i = 0; i < 30; i++) {
      const res = await POST(makeRequest({ email: nextEmail() }, ip));
      expect(res.status).toBe(200);
    }
    const limited = await POST(makeRequest({ email: nextEmail() }, ip));
    expect(limited.status).toBe(429);
    const body = await limited.json();
    expect(body.error).toMatch(/Demasiadas solicitudes/);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("responde 429 cuando se supera el límite por email (3 en la ventana), sin contarlo contra otras cuentas", async () => {
    const email = "limite-email@test.cl";
    for (let i = 0; i < 3; i++) {
      const res = await POST(makeRequest({ email }));
      expect(res.status).toBe(200);
    }
    const limited = await POST(makeRequest({ email }));
    expect(limited.status).toBe(429);

    // Otra cuenta, en otra IP, no se ve afectada por el límite de la anterior.
    const otro = await POST(makeRequest({ email: nextEmail() }));
    expect(otro.status).toBe(200);
  });

  it("normaliza el email (trim + lowercase) al aplicar el límite por cuenta", async () => {
    const base = "normaliza@test.cl";
    for (let i = 0; i < 3; i++) {
      const res = await POST(makeRequest({ email: base }));
      expect(res.status).toBe(200);
    }
    // Mismo email con mayúsculas y espacios: debe pegarle a la MISMA llave de
    // rate limit (ya agotada), no crear una cuenta "nueva".
    const limited = await POST(makeRequest({ email: "  Normaliza@Test.CL  " }));
    expect(limited.status).toBe(429);
  });

  it("responde ok:true sin enviar correo cuando generateLink falla (no filtra si el email existe)", async () => {
    mockGenerateLink.mockResolvedValue({ data: null, error: { message: "user not found" } });
    const res = await POST(makeRequest({ email: nextEmail() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("camino feliz: marca por defecto, sin next — arma el link con la ruta de set-password genérica", async () => {
    const email = nextEmail();
    const res = await POST(makeRequest({ email }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: "recovery",
      email,
      options: { redirectTo: "https://capitalacademy.cl/onboarding/set-password" },
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const sent = mockSend.mock.calls[0][0];
    expect(sent.to).toBe(email);
    expect(sent.from).toBe("Capital Academy <no-reply@example.com>");
    const resetUrl = sent.html as string;
    expect(resetUrl).toContain(
      "https://capitalacademy.cl/auth/confirm?token_hash=tok_abc123&type=recovery&brand=capital-academy",
    );
    // Sin `next`, el destino post-confirmación es la propia ruta de set-password.
    expect(resetUrl).toContain(`next=${encodeURIComponent("/onboarding/set-password")}`);
  });

  it("camino feliz: marca por slug conocido + next válido — arrastra el destino a través del link", async () => {
    const email = nextEmail();
    const res = await POST(makeRequest({ email, brand: "diplomado", next: "/asistencia/123" }));
    expect(res.status).toBe(200);

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: "recovery",
      email,
      options: { redirectTo: "https://capitalacademy.cl/onboarding/diplomado/set-password" },
    });

    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain("brand=diplomado");
    const expectedAfterConfirm = "/onboarding/diplomado/set-password?next=%2Fasistencia%2F123";
    expect(html).toContain(`next=${encodeURIComponent(expectedAfterConfirm)}`);
  });

  it("un slug de marca desconocido cae a la marca genérica (degradación segura)", async () => {
    const email = nextEmail();
    await POST(makeRequest({ email, brand: "no-existe" }));
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain("brand=capital-academy");
  });

  it("rechaza un next absoluto (open-redirect) y cae al destino de set-password", async () => {
    const email = nextEmail();
    await POST(makeRequest({ email, next: "https://evil.com/phish" }));
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain(`next=${encodeURIComponent("/onboarding/set-password")}`);
    expect(html).not.toContain("evil.com");
  });

  it("rechaza un next protocol-relative (//host) y cae al destino de set-password", async () => {
    const email = nextEmail();
    await POST(makeRequest({ email, next: "//evil.com" }));
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain(`next=${encodeURIComponent("/onboarding/set-password")}`);
    expect(html).not.toContain("evil.com");
  });

  it("responde ok:true aunque el envío del correo lance una excepción (no revienta la respuesta)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSend.mockRejectedValue(new Error("resend caído"));
    const res = await POST(makeRequest({ email: nextEmail() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Access link email error:",
      "resend caído",
    );
    consoleErrorSpy.mockRestore();
  });

  // ── Bitácora de correos de acceso (0082) ────────────────────
  // La respuesta al cliente es idéntica en los tres desenlaces —responder
  // distinto delataría qué correos tienen cuenta—, así que lo único que
  // distingue "salió", "falló" y "no existe" es lo que queda registrado.

  it("registra el envío exitoso con el id que devuelve Resend", async () => {
    const email = nextEmail();
    await POST(makeRequest({ email }));

    const row = lastLoggedRow();
    expect(row).toMatchObject({
      email,
      user_id: "user-1",
      kind: "access_link",
      status: "sent",
      provider: "resend",
      provider_message_id: "email_1",
    });
  });

  it("registra 'no_account' cuando el correo no tiene cuenta, sin avisar al equipo", async () => {
    mockGenerateLink.mockResolvedValue({ data: null, error: { message: "user not found" } });
    const email = nextEmail();
    const res = await POST(makeRequest({ email }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(lastLoggedRow()).toMatchObject({ email, status: "no_account" });
    // Un correo mal escrito no es una falla operativa: no despierta a nadie.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("registra 'failed' cuando generateLink falla por un motivo que no es 'no existe'", async () => {
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: "database connection lost" },
    });
    const email = nextEmail();
    const res = await POST(makeRequest({ email }));

    expect(res.status).toBe(200);
    expect(lastLoggedRow()).toMatchObject({
      email,
      status: "failed",
      error: "database connection lost",
    });
  });

  it("registra 'failed' cuando Resend responde con error en vez de lanzar", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    const email = nextEmail();
    const res = await POST(makeRequest({ email }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(lastLoggedRow()).toMatchObject({
      email,
      status: "failed",
      error: "domain not verified",
    });
  });

  it("normaliza el email al registrarlo, para que soporte lo encuentre igual", async () => {
    await POST(makeRequest({ email: "  Mixta@Test.CL  " }));
    expect(lastLoggedRow()).toMatchObject({ email: "mixta@test.cl" });
  });

  it("una bitácora caída no rompe la respuesta ni impide el envío", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLogInsert.mockImplementationOnce(() => {
      throw new Error("supabase caído");
    });

    const res = await POST(makeRequest({ email: nextEmail() }));
    expect(res.status).toBe(200);
    expect(mockSend).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it("codifica caracteres especiales del hashed_token en el resetUrl", async () => {
    mockGenerateLink.mockResolvedValue({
      data: { properties: { hashed_token: "a+b/c=d" } },
      error: null,
    });
    const email = nextEmail();
    await POST(makeRequest({ email }));
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain(`token_hash=${encodeURIComponent("a+b/c=d")}`);
    expect(html).not.toContain("token_hash=a+b/c=d");
  });
});
