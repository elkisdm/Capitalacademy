import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExchange = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: (...a: unknown[]) => mockExchange(...a),
      getUser: () => mockGetUser(),
    },
  }),
}));

const BASE = "https://capitalacademy.cl";
const DEST = "/classroom/go/lesson/abc";

async function call(qs: string) {
  const { GET } = await import("../route");
  const res = await GET(new Request(`${BASE}/auth/callback?${qs}`));
  return new URL(res.headers.get("location")!);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = BASE;
    mockGetUser.mockResolvedValue({ data: { user: null } });
  });

  it("canjea el código y lleva al destino", async () => {
    mockExchange.mockResolvedValue({ error: null });
    const url = await call(`code=xyz&next=${encodeURIComponent(DEST)}`);
    expect(url.pathname).toBe(DEST);
  });

  it("cae a /classroom, no a la ruta inexistente /dashboard", async () => {
    mockExchange.mockResolvedValue({ error: null });
    const url = await call("code=xyz");
    expect(url.pathname).toBe("/classroom");
  });

  it("sigue al destino si el código ya se consumió pero la sesión está abierta", async () => {
    mockExchange.mockResolvedValue({ error: { message: "invalid request" } });
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const url = await call(`code=xyz&next=${encodeURIComponent(DEST)}`);
    expect(url.pathname).toBe(DEST);
  });

  it("conserva destino y marca al volver al login", async () => {
    mockExchange.mockResolvedValue({ error: { message: "invalid request" } });
    const url = await call(`code=xyz&brand=liderazgo&next=${encodeURIComponent(DEST)}`);
    expect(url.pathname).toBe("/login/liderazgo");
    expect(url.searchParams.get("next")).toBe(DEST);
    expect(url.searchParams.get("error")).toBe("link_expired");
  });

  it("usa el dominio canónico y no el permalink del deploy", async () => {
    mockExchange.mockResolvedValue({ error: null });
    const { GET } = await import("../route");
    const res = await GET(
      new Request(`https://6a31--capitalacademy.netlify.app/auth/callback?code=xyz`),
    );
    expect(new URL(res.headers.get("location")!).origin).toBe(BASE);
  });
});
