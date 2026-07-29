import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

const sendSpy = vi.fn();
vi.mock("@/lib/campaigns/send", () => ({
  sendEmailCampaign: (...args: unknown[]) => sendSpy(...args),
}));

const { POST } = await import("@/app/api/admin/campaigns/[campaignId]/send/route");

const ID = "cccccccc-1111-4111-8111-111111111111";
const ctx = (id = ID) => ({ params: Promise.resolve({ campaignId: id }) });

beforeEach(() => {
  authResult = { user: { id: "admin-1" } };
  sendSpy.mockReset();
  sendSpy.mockResolvedValue({ status: "sent", sent: 3, alreadySent: 0, total: 3 });
});

describe("POST /api/admin/campaigns/[campaignId]/send", () => {
  it("propaga el 403 de authorizeAdmin y no envía nada", async () => {
    authResult = { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };

    const res = await POST(new Request("http://x"), ctx());

    expect(res.status).toBe(403);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("rechaza un id inválido sin llamar al despachador", async () => {
    const res = await POST(new Request("http://x"), ctx("no-es-uuid"));

    expect(res.status).toBe(422);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("devuelve el resultado del envío", async () => {
    const res = await POST(new Request("http://x"), ctx());

    expect(res.status).toBe(200);
    expect((await res.json()).result.sent).toBe(3);
    expect(sendSpy).toHaveBeenCalledWith(ID);
  });

  // Reenviar una campaña ya enviada es el error caro de este módulo.
  it("responde 409 cuando el despachador la salta", async () => {
    sendSpy.mockResolvedValue({
      status: "skipped",
      reason: "La campaña ya fue enviada o hay un envío en curso",
    });

    const res = await POST(new Request("http://x"), ctx());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("ya fue enviada");
  });

  it("informa la entrega parcial sin fingir éxito", async () => {
    sendSpy.mockResolvedValue({
      status: "partial",
      sent: 2,
      failed: 1,
      alreadySent: 0,
      total: 3,
    });

    const body = await (await POST(new Request("http://x"), ctx())).json();

    expect(body.result.status).toBe("partial");
    expect(body.result.failed).toBe(1);
  });

  it("traduce una excepción a 500", async () => {
    sendSpy.mockRejectedValue(new Error("boom"));

    expect((await POST(new Request("http://x"), ctx())).status).toBe(500);
  });
});
