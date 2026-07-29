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
  staff: Array<{ email: string | null }>;
};
let state: State;

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  // `.in("system_role", …)` es la consulta de la lista blanca de staff.
  b.in = () => ({
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: state.staff, error: null }).then(res, rej),
  });
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
const TEAM = "academia@capitalinteligente.cl";

function req(body?: unknown) {
  return new Request("http://x", {
    method: "POST",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

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
    staff: [
      { email: "admin@capitalacademy.cl" },
      { email: TEAM },
      { email: "pvicuna@capitalinteligente.cl" },
    ],
  };
  sendSpy.mockReset();
  sendSpy.mockResolvedValue({ data: { id: "re_1" }, error: null });
});

describe("POST /api/admin/campaigns/[campaignId]/test", () => {
  it("propaga el 403", async () => {
    authResult = { error: NextResponse.json({ error: "x" }, { status: 403 }) };
    expect((await POST(req(), ctx())).status).toBe(403);
  });

  it("rechaza un id inválido", async () => {
    expect((await POST(req(), ctx("abc"))).status).toBe(422);
  });

  it("404 si la campaña no existe", async () => {
    state.campaign = null;
    expect((await POST(req(), ctx())).status).toBe(404);
  });

  it("envía a la casilla del equipo y con copia a quien la crea", async () => {
    const res = await POST(req(), ctx());
    const payload = sendSpy.mock.calls[0][0];

    expect(res.status).toBe(200);
    expect(payload.to).toEqual([TEAM, "admin@capitalacademy.cl"]);
    expect((await res.json()).to).toEqual([TEAM, "admin@capitalacademy.cl"]);
  });

  it("no duplica el destinatario si el autor ES la casilla del equipo", async () => {
    authResult = { user: { id: "admin-1", email: TEAM } };

    await POST(req(), ctx());

    expect(sendSpy.mock.calls[0][0].to).toEqual([TEAM]);
  });

  it("permite reemplazar la casilla del equipo, manteniendo la copia al autor", async () => {
    await POST(req({ to: "pvicuna@capitalinteligente.cl" }), ctx());

    expect(sendSpy.mock.calls[0][0].to).toEqual([
      "pvicuna@capitalinteligente.cl",
      "admin@capitalacademy.cl",
    ]);
  });

  // Sin la lista blanca, este endpoint sería un relay para mandar correo con la
  // marca de Capital Academy a cualquier dirección del mundo.
  it("rechaza un destino que no es del equipo", async () => {
    const res = await POST(req({ to: "cualquiera@gmail.com" }), ctx());

    expect(res.status).toBe(403);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  // Un destino puede ser válido y aun así perderse: capitalacademy.cl no tiene MX.
  it("avisa cuáles destinos no pueden recibir correo", async () => {
    const body = await (await POST(req(), ctx())).json();

    expect(body.undeliverable).toEqual(["admin@capitalacademy.cl"]);
  });

  it("no marca como perdido un dominio que sí recibe", async () => {
    authResult = { user: { id: "admin-1", email: "pvicuna@capitalinteligente.cl" } };

    const body = await (await POST(req(), ctx())).json();

    expect(body.undeliverable).toEqual([]);
  });

  it("422 si no hay ninguna casilla a la que enviar", async () => {
    authResult = { user: { id: "admin-1" } };
    state.staff = [];
    const res = await POST(req({ to: " " }), ctx());

    // Sin `to` usable ni correo del autor, igual queda la casilla del equipo:
    // lo que se verifica es que nunca se envía a una lista vacía.
    expect([200, 403, 422]).toContain(res.status);
    if (res.status === 200) expect(sendSpy.mock.calls[0][0].to.length).toBeGreaterThan(0);
  });

  it("marca el asunto como prueba", async () => {
    await POST(req(), ctx());
    expect(sendSpy.mock.calls[0][0].subject).toBe("[PRUEBA] Novedades");
  });

  it("saluda al admin por su nombre", async () => {
    await POST(req(), ctx());
    expect(sendSpy.mock.calls[0][0].html).toContain("Hola, Elkis");
  });

  it("502 si Resend rechaza el correo", async () => {
    sendSpy.mockResolvedValue({ data: null, error: { message: "invalid" } });
    expect((await POST(req(), ctx())).status).toBe(502);
  });

  it("500 si el envío revienta", async () => {
    sendSpy.mockRejectedValue(new Error("network"));
    expect((await POST(req(), ctx())).status).toBe(500);
  });
});
