import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mutable mock state ────────────────────────────────────────

const mockSignOut = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  // `redirect()` de next/navigation nunca retorna: lanza para cortar el
  // flujo. Se imita ese comportamiento para poder aserir el destino desde
  // el rechazo de la promesa.
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signOut: (...args: unknown[]) => mockSignOut(...args) },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// ── Import handler (DESPUÉS de los mocks) ─────────────────────

const { POST } = await import("@/app/api/auth/signout/route");

function makeRequest(body?: BodyInit, contentType = "application/x-www-form-urlencoded") {
  return new Request("http://localhost/api/auth/signout", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSignOut.mockResolvedValue({ error: null });
});

describe("POST /api/auth/signout", () => {
  it("camino feliz: sin next, cierra sesión y redirige a /login", async () => {
    await expect(POST(makeRequest(new URLSearchParams()))).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("camino feliz: con next válido, arrastra el destino al login", async () => {
    const params = new URLSearchParams({ next: "/asistencia/123" });
    await expect(POST(makeRequest(params))).rejects.toThrow(
      `REDIRECT:/login?next=${encodeURIComponent("/asistencia/123")}`,
    );
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("rechaza un next absoluto (open-redirect) y cae a /login sin next", async () => {
    const params = new URLSearchParams({ next: "https://evil.com/phish" });
    await expect(POST(makeRequest(params))).rejects.toThrow("REDIRECT:/login");
  });

  it("caso de error: body no parseable como form data — igual cierra sesión y redirige a /login", async () => {
    const res = POST(
      makeRequest("garbage-body-sin-boundary", "multipart/form-data"),
    );
    await expect(res).rejects.toThrow("REDIRECT:/login");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
