import { describe, it, expect, vi, beforeEach } from "vitest";

let staffResult: { user: { id: string } } | { error: Response };

vi.mock("@/lib/auth/authorize-admin", () => ({
  requireSessionStaff: vi.fn(async () => staffResult),
}));

type SignedUrlResult = { data: { path: string; token: string } | null; error: unknown };
let signedUrlResult: SignedUrlResult;
const createSignedUploadUrlSpy = vi.fn((_path: string) => Promise.resolve(signedUrlResult));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: () => ({
        createSignedUploadUrl: createSignedUploadUrlSpy,
      }),
    },
  })),
}));

const { POST } = await import("@/app/api/admin/session-resources/upload-url/route");

const SESSION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-555555555555";

function postReq(body: unknown) {
  return new Request("http://x/api/admin/session-resources/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin/session-resources/upload-url route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staffResult = { user: { id: "staff-1" } };
    signedUrlResult = {
      data: { path: `s/${SESSION_ID}/abc-doc.pdf`, token: "tok-123" },
      error: null,
    };
  });

  it("rechaza body no-JSON con 400", async () => {
    const req = new Request("http://x/api/admin/session-resources/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "no-es-json{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Body inválido");
  });

  it("rechaza sessionId que no es uuid-like con 422", async () => {
    const res = await POST(
      postReq({ sessionId: "no-es-uuid", filename: "doc.pdf", size: 1000 }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
  });

  it("rechaza filename vacío con 422", async () => {
    const res = await POST(
      postReq({ sessionId: SESSION_ID, filename: "  ", size: 1000 }),
    );
    expect(res.status).toBe(422);
  });

  it("rechaza size no positivo con 422", async () => {
    const res = await POST(
      postReq({ sessionId: SESSION_ID, filename: "doc.pdf", size: 0 }),
    );
    expect(res.status).toBe(422);
  });

  it("rechaza size mayor a 50 MB con 422", async () => {
    const res = await POST(
      postReq({ sessionId: SESSION_ID, filename: "doc.pdf", size: 50 * 1024 * 1024 + 1 }),
    );
    expect(res.status).toBe(422);
  });

  it("propaga el error de requireSessionStaff (permiso denegado)", async () => {
    staffResult = {
      error: new Response(JSON.stringify({ error: "No autenticado" }), { status: 401 }),
    };
    const res = await POST(
      postReq({ sessionId: SESSION_ID, filename: "doc.pdf", size: 1000 }),
    );
    expect(res.status).toBe(401);
    expect(createSignedUploadUrlSpy).not.toHaveBeenCalled();
  });

  it("responde 500 cuando el storage provider devuelve error", async () => {
    signedUrlResult = { data: null, error: new Error("boom") };
    const res = await POST(
      postReq({ sessionId: SESSION_ID, filename: "doc.pdf", size: 1000 }),
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("No se pudo iniciar la subida");
  });

  it("responde 500 cuando data es null sin error explícito", async () => {
    signedUrlResult = { data: null, error: null };
    const res = await POST(
      postReq({ sessionId: SESSION_ID, filename: "doc.pdf", size: 1000 }),
    );
    expect(res.status).toBe(500);
  });

  it("genera una url firmada con path saneado y prefijo de sesión (200)", async () => {
    const res = await POST(
      postReq({ sessionId: SESSION_ID, filename: "Informe Final (2026).pdf", size: 2048 }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.path).toBe(`s/${SESSION_ID}/abc-doc.pdf`);
    expect(json.token).toBe("tok-123");

    // Verifica que el path pasado al provider tenga el prefijo de sesión
    // y el nombre saneado (sin espacios ni paréntesis).
    const calledPath = createSignedUploadUrlSpy.mock.calls[0][0] as string;
    expect(calledPath).toMatch(new RegExp(`^s/${SESSION_ID}/[0-9a-f-]+-Informe-Final-2026.pdf$`));
  });

  it("usa 'archivo' como nombre cuando el filename saneado queda vacío", async () => {
    const res = await POST(
      postReq({ sessionId: SESSION_ID, filename: "***", size: 500 }),
    );
    expect(res.status).toBe(200);
    const calledPath = createSignedUploadUrlSpy.mock.calls[0][0] as string;
    expect(calledPath).toMatch(new RegExp(`^s/${SESSION_ID}/[0-9a-f-]+-archivo$`));
  });
});
