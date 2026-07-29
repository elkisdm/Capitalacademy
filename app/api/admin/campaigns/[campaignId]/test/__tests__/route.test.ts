import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";

type AuthResult = { user: { id: string; email?: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

type State = {
  campaign: Record<string, unknown> | null;
  profile: { full_name: string } | null;
};
let state: State;

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.maybeSingle = () =>
    Promise.resolve({
      data: table === "profiles" ? state.profile : state.campaign,
      error: null,
    });
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: (t: string) => makeBuilder(t) })),
}));

const sendSpy = vi.fn();
vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send: (...a: unknown[]) => sendSpy(...a) } }),
  FROM_EMAIL: "Capital Academy <no-reply@example.com>",
}));

const { POST } = await import("@/app/api/admin/campaigns/[campaignId]/test/route");

const ID = "cccccccc-1111-4111-8111-111111111111";
const ctx = (id = ID) => ({ params: Promise.resolve({ campaignId: id }) });

beforeEach(() => {
  authResult = { user: { id: "admin-1", email: "admin@capitalacademy.cl" } };
  state = {
    campaign: {
      program_id: "a0000000-0000-0000-0000-000000000002",
      subject: "Novedades",
      preheader: null,
      body_md: "Hola a todos.",
      cta_label: null,
      cta_url: null,
    },
    profile: { full_name: "Elkis Daza" },
  };
  sendSpy.mockReset();
  sendSpy.mockResolvedValue({ data: { id: "re_1" }, error: null });
});

describe("POST /api/admin/campaigns/[campaignId]/test", () => {
  it("propaga el 403", async () => {
    authResult = { error: NextResponse.json({ error: "x" }, { status: 403 }) };
    expect((await POST(new Request("http://x"), ctx())).status).toBe(403);
  });

  it("rechaza un id inválido", async () => {
    expect((await POST(new Request("http://x"), ctx("abc"))).status).toBe(422);
  });

  it("422 si la cuenta del admin no tiene correo", async () => {
    authResult = { user: { id: "admin-1" } };
    const res = await POST(new Request("http://x"), ctx());

    expect(res.status).toBe(422);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("404 si la campaña no existe", async () => {
    state.campaign = null;
    expect((await POST(new Request("http://x"), ctx())).status).toBe(404);
  });

  // El destinatario NO se acepta por body: si se pudiera elegir, el endpoint
  // sería un relay para mandar correo con la marca a cualquier dirección.
  it("envía solo a la casilla del admin autenticado", async () => {
    const res = await POST(new Request("http://x"), ctx());
    const payload = sendSpy.mock.calls[0][0];

    expect(res.status).toBe(200);
    expect(payload.to).toBe("admin@capitalacademy.cl");
    expect((await res.json()).to).toBe("admin@capitalacademy.cl");
  });

  it("marca el asunto como prueba", async () => {
    await POST(new Request("http://x"), ctx());
    expect(sendSpy.mock.calls[0][0].subject).toBe("[PRUEBA] Novedades");
  });

  it("saluda al admin por su nombre", async () => {
    await POST(new Request("http://x"), ctx());
    expect(sendSpy.mock.calls[0][0].html).toContain("Hola, Elkis");
  });

  it("502 si Resend rechaza el correo", async () => {
    sendSpy.mockResolvedValue({ data: null, error: { message: "invalid" } });
    expect((await POST(new Request("http://x"), ctx())).status).toBe(502);
  });

  it("500 si el envío revienta", async () => {
    sendSpy.mockRejectedValue(new Error("network"));
    expect((await POST(new Request("http://x"), ctx())).status).toBe(500);
  });
});
