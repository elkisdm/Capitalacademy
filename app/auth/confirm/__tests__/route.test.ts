import { describe, it, expect, vi, beforeEach } from "vitest";

const mockVerifyOtp = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
      getUser: () => mockGetUser(),
    },
  }),
}));

const BASE = "https://capitalacademy.cl";
const ASISTENCIA = "/asistencia/e0000000-0000-0000-0000-000000000010";

async function call(qs: string) {
  const { GET } = await import("../route");
  const res = await GET(new Request(`${BASE}/auth/confirm?${qs}`));
  return new URL(res.headers.get("location")!);
}

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = BASE;
    mockGetUser.mockResolvedValue({ data: { user: null } });
  });

  it("lleva al destino cuando el token es válido", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    const url = await call(`token_hash=abc&type=recovery&next=${encodeURIComponent(ASISTENCIA)}`);
    expect(url.pathname).toBe(ASISTENCIA);
  });

  it("conserva destino y marca al volver al login por enlace vencido", async () => {
    mockVerifyOtp.mockResolvedValue({
      error: { message: "Email link is invalid or has expired" },
    });
    const url = await call(
      `token_hash=abc&type=recovery&brand=diplomado&next=${encodeURIComponent(ASISTENCIA)}`,
    );
    expect(url.pathname).toBe("/login/diplomado");
    expect(url.searchParams.get("next")).toBe(ASISTENCIA);
    expect(url.searchParams.get("error")).toBe("link_expired");
  });

  it("sigue al destino si el token ya se consumió pero la sesión está abierta", async () => {
    // Segundo GET del mismo enlace (escáner de correo / recarga): verifyOtp
    // falla con 403 aunque la sesión ya quedó creada en el primero.
    mockVerifyOtp.mockResolvedValue({
      error: { message: "Email link is invalid or has expired" },
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });

    const url = await call(`token_hash=abc&type=recovery&next=${encodeURIComponent(ASISTENCIA)}`);
    expect(url.pathname).toBe(ASISTENCIA);
    expect(url.searchParams.get("error")).toBeNull();
  });

  it("rechaza un next externo (open-redirect)", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    const url = await call("token_hash=abc&next=https%3A%2F%2Fevil.com");
    expect(url.origin).toBe(BASE);
    expect(url.pathname).toBe("/classroom");
  });

  it("vuelve al login sin token", async () => {
    const url = await call("type=recovery");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("error")).toBe("missing_token");
  });
});
