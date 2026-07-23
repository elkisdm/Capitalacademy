import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: () => mockGetUser() } }),
}));

async function redirectFor(url: string) {
  const { updateSession } = await import("../middleware");
  const res = await updateSession(new NextRequest(new Request(url)));
  return new URL(res.headers.get("location")!);
}

describe("updateSession — redirect al login del visitante sin sesión", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    mockGetUser.mockResolvedValue({ data: { user: null } });
  });

  it("conserva el querystring del destino", async () => {
    const url = await redirectFor("https://capitalacademy.cl/classroom/go/lesson/abc?t=120");
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/classroom/go/lesson/abc?t=120");
  });

  it("no arrastra los parámetros originales al login", async () => {
    // Un `?error=` en el destino se colaba tal cual al login y pintaba un
    // aviso de error que no correspondía a nada.
    const url = await redirectFor("https://capitalacademy.cl/classroom/x?error=algo");
    expect(url.searchParams.get("error")).toBeNull();
    expect(url.searchParams.get("next")).toBe("/classroom/x?error=algo");
  });

  it("responde 401 JSON en /api/* en vez de redirigir", async () => {
    const { updateSession } = await import("../middleware");
    const res = await updateSession(
      new NextRequest(new Request("https://capitalacademy.cl/api/admin/users")),
    );
    expect(res.status).toBe(401);
  });
});
