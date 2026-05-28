import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetchFlowPaymentStatus = vi.fn();
const mockMapFlowStatus = vi.fn();
const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});
const mockSelectPayment = vi.fn();

vi.mock("@/lib/flow/status", () => ({
  fetchFlowPaymentStatus: (...args: unknown[]) =>
    mockFetchFlowPaymentStatus(...args),
  mapFlowStatus: (...args: unknown[]) => mockMapFlowStatus(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "payments") {
        return {
          select: () => ({
            eq: () => ({
              single: mockSelectPayment,
            }),
          }),
          update: mockUpdate,
        };
      }
      return {};
    },
  })),
}));

vi.mock("@/lib/email/payment-confirmation", () => ({
  sendPaymentConfirmationEmail: vi.fn(async () => ({ ok: true })),
  sendPaymentTeamNotification: vi.fn(async () => ({ ok: true })),
}));

const { POST } = await import("@/app/api/flow/webhook/route");

function makeFormRequest(body: string) {
  return new Request("http://localhost/api/flow/webhook", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("POST /api/flow/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when no token is provided", async () => {
    const res = await POST(makeFormRequest(""));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("missing-token");
  });

  it("returns 401 when Flow status check fails", async () => {
    mockFetchFlowPaymentStatus.mockResolvedValue({
      ok: false,
      reason: "invalid-token",
    });

    const res = await POST(makeFormRequest("token=bad-token"));
    expect(res.status).toBe(401);
  });

  it("ignores unknown payment tokens gracefully", async () => {
    mockFetchFlowPaymentStatus.mockResolvedValue({
      ok: true,
      data: { status: 2, flowOrder: "F-123" },
    });
    mockMapFlowStatus.mockReturnValue("succeeded");
    mockSelectPayment.mockResolvedValue({ data: null });

    const res = await POST(makeFormRequest("token=unknown-token"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe("unknown-token");
  });

  it("updates payment status to succeeded and sends emails", async () => {
    mockFetchFlowPaymentStatus.mockResolvedValue({
      ok: true,
      data: { status: 2, flowOrder: "F-456", amount: 500000 },
    });
    mockMapFlowStatus.mockReturnValue("succeeded");
    mockSelectPayment.mockResolvedValue({
      data: {
        id: "pay-1",
        firstname: "Juan",
        lastname: "Pérez",
        email: "juan@test.com",
        rut: "12345678-9",
        phone: "+56912345678",
        amount_clp: 500000,
        paid_at: null,
        plan: "contado",
        coupon_code: null,
        discount_clp: null,
      },
    });

    const res = await POST(makeFormRequest("token=valid-token"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(mockUpdate).toHaveBeenCalled();

    const { sendPaymentConfirmationEmail, sendPaymentTeamNotification } =
      await import("@/lib/email/payment-confirmation");
    expect(sendPaymentConfirmationEmail).toHaveBeenCalled();
    expect(sendPaymentTeamNotification).toHaveBeenCalled();
  });

  it("does not re-send emails for already-paid transactions", async () => {
    mockFetchFlowPaymentStatus.mockResolvedValue({
      ok: true,
      data: { status: 2, flowOrder: "F-789", amount: 500000 },
    });
    mockMapFlowStatus.mockReturnValue("succeeded");
    mockSelectPayment.mockResolvedValue({
      data: {
        id: "pay-2",
        firstname: "Ana",
        lastname: "López",
        email: "ana@test.com",
        rut: "98765432-1",
        phone: "+56987654321",
        amount_clp: 500000,
        paid_at: "2026-01-01T00:00:00Z",
        plan: "contado",
        coupon_code: null,
        discount_clp: null,
      },
    });

    const res = await POST(makeFormRequest("token=dup-token"));
    expect(res.status).toBe(200);

    const { sendPaymentConfirmationEmail } = await import(
      "@/lib/email/payment-confirmation"
    );
    expect(sendPaymentConfirmationEmail).not.toHaveBeenCalled();
  });

  it("handles DB update error gracefully", async () => {
    mockFetchFlowPaymentStatus.mockResolvedValue({
      ok: true,
      data: { status: 2, flowOrder: "F-ERR", amount: 500000 },
    });
    mockMapFlowStatus.mockReturnValue("succeeded");
    mockSelectPayment.mockResolvedValue({
      data: {
        id: "pay-err",
        firstname: "Error",
        lastname: "Test",
        email: "err@test.com",
        rut: "12345678-9",
        phone: "+56912345678",
        amount_clp: 500000,
        paid_at: null,
        plan: "contado",
        coupon_code: null,
        discount_clp: null,
      },
    });
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: { message: "DB error" } }),
    });

    const res = await POST(makeFormRequest("token=err-token"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("db");
  });

  it("logs amount mismatch but still succeeds", async () => {
    mockFetchFlowPaymentStatus.mockResolvedValue({
      ok: true,
      data: { status: 2, flowOrder: "F-MM", amount: 400000 },
    });
    mockMapFlowStatus.mockReturnValue("succeeded");
    mockSelectPayment.mockResolvedValue({
      data: {
        id: "pay-mm",
        firstname: "Mismatch",
        lastname: "Test",
        email: "mm@test.com",
        rut: "12345678-9",
        phone: "+56912345678",
        amount_clp: 500000,
        paid_at: null,
        plan: "contado",
        coupon_code: null,
        discount_clp: null,
      },
    });
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await POST(makeFormRequest("token=mm-token"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("handles JSON content type", async () => {
    mockFetchFlowPaymentStatus.mockResolvedValue({
      ok: false,
      reason: "invalid",
    });

    const req = new Request("http://localhost/api/flow/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "json-token" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("handles failed payment status", async () => {
    mockFetchFlowPaymentStatus.mockResolvedValue({
      ok: true,
      data: { status: 3, flowOrder: "F-FAIL" },
    });
    mockMapFlowStatus.mockReturnValue("failed");
    mockSelectPayment.mockResolvedValue({
      data: {
        id: "pay-fail",
        firstname: "Fail",
        lastname: "Test",
        email: "fail@test.com",
        rut: "12345678-9",
        phone: "+56912345678",
        amount_clp: 500000,
        paid_at: null,
        plan: "contado",
        coupon_code: null,
        discount_clp: null,
      },
    });
    mockUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await POST(makeFormRequest("token=fail-token"));
    expect(res.status).toBe(200);

    const { sendPaymentConfirmationEmail } = await import(
      "@/lib/email/payment-confirmation"
    );
    expect(sendPaymentConfirmationEmail).not.toHaveBeenCalled();
  });
});
