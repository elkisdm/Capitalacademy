import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────

let userCounter = 0;
function nextUserId() {
  userCounter += 1;
  return `u-${String(userCounter).padStart(8, "0")}-1111-1111-1111-111111111111`;
}

function makeFile(name: string, type: string, sizeBytes: number) {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

function makeFormRequest(
  fields: { kind?: string; message?: string; pageUrl?: string },
  files: File[] = [],
) {
  const fd = new FormData();
  if (fields.kind !== undefined) fd.append("kind", fields.kind);
  if (fields.message !== undefined) fd.append("message", fields.message);
  if (fields.pageUrl !== undefined) fd.append("pageUrl", fields.pageUrl);
  for (const f of files) fd.append("files", f);
  return new Request("http://localhost/api/support", { method: "POST", body: fd });
}

function makeMalformedMultipartRequest() {
  return new Request("http://localhost/api/support", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=----X" },
    body: "esto-no-es-multipart-valido",
  });
}

// ── Mutable mock state (leída en el momento por los mocks) ───

const mockState = {
  user: null as { id: string; email?: string } | null,
  profileRow: { full_name: "Ana Test" } as Record<string, unknown> | null,
  profileError: null as { message?: string } | null,
};

const mockSend = vi.fn();

function profileQueryBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.single = () =>
    Promise.resolve({ data: mockState.profileRow, error: mockState.profileError });
  return builder;
}

// ── Module mocks (hoisted por vitest) ─────────────────────────

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: mockState.user } }),
    },
    from: (_table: string) => profileQueryBuilder(),
  })),
}));

vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: (...args: unknown[]) => mockSend(...args) } }),
  FROM_EMAIL: "Capital Academy <no-reply@example.com>",
}));

// ── Import handler (DESPUÉS de los mocks) ────────────────────

const { POST } = await import("@/app/api/support/route");

beforeEach(() => {
  vi.clearAllMocks();
  mockState.user = { id: nextUserId(), email: "ana@test.cl" };
  mockState.profileRow = { full_name: "Ana Test" };
  mockState.profileError = null;
  mockSend.mockResolvedValue({ data: { id: "email_1" }, error: null });
});

describe("POST /api/support", () => {
  it("responde 401 cuando no hay usuario autenticado", async () => {
    mockState.user = null;
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("No autenticado");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("responde 429 tras superar el límite de 5 solicitudes en la ventana", async () => {
    const req = () => makeFormRequest({ kind: "problem", message: "hola mundo válido" });
    for (let i = 0; i < 5; i++) {
      const ok = await POST(req());
      expect(ok.status).toBe(200);
    }
    const limited = await POST(req());
    expect(limited.status).toBe(429);
    const body = await limited.json();
    expect(body.error).toMatch(/Demasiadas solicitudes/);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("responde 400 cuando el body no se puede parsear como FormData", async () => {
    const res = await POST(makeMalformedMultipartRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Body inválido");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("responde 400 cuando el tipo de solicitud (kind) es inválido", async () => {
    const res = await POST(makeFormRequest({ kind: "otro", message: "hola mundo válido" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Tipo de solicitud inválido");
  });

  it("responde 400 cuando falta kind por completo", async () => {
    const res = await POST(makeFormRequest({ message: "hola mundo válido" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Tipo de solicitud inválido");
  });

  it("responde 400 cuando el mensaje es más corto que 5 caracteres", async () => {
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/mínimo 5 caracteres/);
  });

  it("acepta un mensaje de exactamente 5 caracteres (límite inferior)", async () => {
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola!" }));
    expect(res.status).toBe(200);
  });

  it("responde 400 cuando el mensaje supera los 4000 caracteres", async () => {
    const largeMessage = "a".repeat(4001);
    const res = await POST(makeFormRequest({ kind: "feature", message: largeMessage }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no puede superar 4000 caracteres/);
  });

  it("acepta un mensaje de exactamente 4000 caracteres (límite superior)", async () => {
    const res = await POST(makeFormRequest({ kind: "feature", message: "a".repeat(4000) }));
    expect(res.status).toBe(200);
  });

  it("responde 400 cuando se envían más de 3 capturas", async () => {
    const files = [
      makeFile("a.png", "image/png", 10),
      makeFile("b.png", "image/png", 10),
      makeFile("c.png", "image/png", 10),
      makeFile("d.png", "image/png", 10),
    ];
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }, files));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Máximo 3 capturas/);
  });

  it("acepta exactamente 3 capturas (límite superior de archivos)", async () => {
    const files = [
      makeFile("a.png", "image/png", 10),
      makeFile("b.png", "image/png", 10),
      makeFile("c.png", "image/png", 10),
    ];
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }, files));
    expect(res.status).toBe(200);
    const sentAttachments = mockSend.mock.calls[0][0].attachments;
    expect(sentAttachments).toHaveLength(3);
  });

  it("ignora archivos vacíos (size 0) al contar y validar capturas", async () => {
    const files = [makeFile("vacio.png", "image/png", 0), makeFile("real.png", "image/png", 10)];
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }, files));
    expect(res.status).toBe(200);
    const sentAttachments = mockSend.mock.calls[0][0].attachments;
    expect(sentAttachments).toHaveLength(1);
    expect(sentAttachments[0].filename).toBe("real.png");
  });

  it("responde 400 cuando una captura no es de tipo imagen", async () => {
    const files = [makeFile("doc.pdf", "application/pdf", 10)];
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }, files));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Solo se permiten imágenes como capturas.");
  });

  it("responde 400 cuando una captura supera 5 MB", async () => {
    const files = [makeFile("grande.png", "image/png", 5 * 1024 * 1024 + 1)];
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }, files));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Cada captura debe pesar 5 MB o menos.");
  });

  it("acepta una captura de exactamente 5 MB (límite superior de tamaño)", async () => {
    const files = [makeFile("justo.png", "image/png", 5 * 1024 * 1024)];
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }, files));
    expect(res.status).toBe(200);
  });

  it("sanea el nombre de archivo de las capturas (espacios y caracteres especiales)", async () => {
    const files = [makeFile("mi captura!! (1).png", "image/png", 10)];
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }, files));
    expect(res.status).toBe(200);
    const sentAttachments = mockSend.mock.calls[0][0].attachments;
    expect(sentAttachments[0].filename).toBe("mi-captura-1.png");
  });

  it("usa 'captura.png' cuando el nombre de archivo queda vacío tras sanear", async () => {
    // BUG: si el nombre original solo trae símbolos no permitidos (p. ej. emoji),
    // safeName() los elimina todos y el nombre queda vacío; el fallback interno
    // cubre ese caso devolviendo "captura.png", que es el comportamiento actual.
    const files = [makeFile("😀", "image/png", 10)];
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }, files));
    expect(res.status).toBe(200);
    const sentAttachments = mockSend.mock.calls[0][0].attachments;
    expect(sentAttachments[0].filename).toBe("captura.png");
  });

  it("codifica el contenido de la captura en base64", async () => {
    const files = [makeFile("a.png", "image/png", 4)];
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }, files));
    expect(res.status).toBe(200);
    const sentAttachments = mockSend.mock.calls[0][0].attachments;
    expect(sentAttachments[0].content).toBe(Buffer.from(new Uint8Array(4)).toString("base64"));
  });

  it("recorta pageUrl a 300 caracteres y lo incluye en el envío", async () => {
    const longUrl = "https://capitalacademy.cl/" + "x".repeat(320);
    const res = await POST(
      makeFormRequest({ kind: "problem", message: "hola mundo válido", pageUrl: longUrl }),
    );
    expect(res.status).toBe(200);
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain(longUrl.slice(0, 300));
    expect(html).not.toContain(longUrl);
  });

  it("omite pageUrl del envío cuando no se proporciona", async () => {
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }));
    expect(res.status).toBe(200);
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).not.toContain("Página:");
  });

  it("usa el nombre del perfil como remitente cuando existe", async () => {
    mockState.profileRow = { full_name: "Paola Vicuña" };
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }));
    expect(res.status).toBe(200);
    expect(mockSend.mock.calls[0][0].subject).toContain("Paola Vicuña");
  });

  it("cae al correo del usuario como remitente cuando el perfil no tiene full_name", async () => {
    mockState.profileRow = { full_name: "   " };
    mockState.user = { id: nextUserId(), email: "sin-nombre@test.cl" };
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }));
    expect(res.status).toBe(200);
    expect(mockSend.mock.calls[0][0].subject).toContain("sin-nombre@test.cl");
  });

  it("cae al correo del usuario como remitente cuando la consulta de perfil falla", async () => {
    mockState.profileRow = null;
    mockState.profileError = { message: "boom" };
    mockState.user = { id: nextUserId(), email: "otro@test.cl" };
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }));
    expect(res.status).toBe(200);
    expect(mockSend.mock.calls[0][0].subject).toContain("otro@test.cl");
    expect(mockSend.mock.calls[0][0].replyTo).toBe("otro@test.cl");
  });

  it("usa 'Usuario' como remitente cuando no hay full_name ni email", async () => {
    mockState.profileRow = null;
    mockState.user = { id: nextUserId() };
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }));
    expect(res.status).toBe(200);
    expect(mockSend.mock.calls[0][0].subject).toContain("Usuario");
    expect(mockSend.mock.calls[0][0].replyTo).toBe("");
  });

  it("responde 200 con ok:true en el camino feliz sin archivos", async () => {
    const res = await POST(makeFormRequest({ kind: "feature", message: "propuesta de mejora" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("responde 502 cuando el proveedor de correo falla al enviar", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "resend caído" } });
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("No pudimos enviar tu mensaje. Intenta de nuevo en un momento.");
  });

  it("responde 502 cuando el envío lanza una excepción", async () => {
    mockSend.mockRejectedValue(new Error("network down"));
    const res = await POST(makeFormRequest({ kind: "problem", message: "hola mundo válido" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("No pudimos enviar tu mensaje. Intenta de nuevo en un momento.");
  });
});
