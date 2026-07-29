import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { SurveysNotConfiguredError } from "@/lib/surveys/config";

type AuthResult = { user: { id: string } } | { error: Response };
let authResult: AuthResult;

vi.mock("@/lib/auth/authorize-admin", () => ({
  authorizeAdmin: vi.fn(async () => authResult),
}));

const sendSpy = vi.fn();
vi.mock("@/lib/surveys/send", () => ({
  sendSurveyCampaign: (...args: unknown[]) => sendSpy(...args),
}));

const { POST } = await import("@/app/api/admin/surveys/[campaignId]/send/route");

const ID = "dddddddd-2222-4222-8222-222222222222";
const ctx = (id = ID) => ({ params: Promise.resolve({ campaignId: id }) });

beforeEach(() => {
  authResult = { user: { id: "admin-1" } };
  sendSpy.mockReset();
  sendSpy.mockResolvedValue({ status: "sent", sent: 2, alreadySent: 0, total: 2 });
});

describe("POST /api/admin/surveys/[campaignId]/send", () => {
  it("propaga el 403 sin enviar", async () => {
    authResult = { error: NextResponse.json({ error: "x" }, { status: 403 }) };

    expect((await POST(new Request("http://x"), ctx())).status).toBe(403);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("rechaza un id inválido sin enviar", async () => {
    expect((await POST(new Request("http://x"), ctx("abc"))).status).toBe(422);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("devuelve el resultado", async () => {
    const res = await POST(new Request("http://x"), ctx());

    expect(res.status).toBe(200);
    expect((await res.json()).result.sent).toBe(2);
  });

  it("409 si ya se envió o hay un envío en curso", async () => {
    sendSpy.mockResolvedValue({ status: "skipped", reason: "La encuesta ya fue enviada" });

    expect((await POST(new Request("http://x"), ctx())).status).toBe(409);
  });

  it("503 con las variables faltantes", async () => {
    sendSpy.mockRejectedValue(new SurveysNotConfiguredError(["SURVEY_RECIPIENTS_INGEST_SECRET"]));

    const res = await POST(new Request("http://x"), ctx());

    expect(res.status).toBe(503);
    expect((await res.json()).missing).toContain("SURVEY_RECIPIENTS_INGEST_SECRET");
  });

  it("500 ante una excepción inesperada", async () => {
    sendSpy.mockRejectedValue(new Error("boom"));
    expect((await POST(new Request("http://x"), ctx())).status).toBe(500);
  });
});
