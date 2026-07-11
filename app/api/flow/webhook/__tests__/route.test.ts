import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetchFlowPaymentStatus = vi.fn();
const mockMapFlowStatus = vi.fn();
const mockEnrollDiplomadoBuyer = vi.fn();

// Supabase admin mock — supports both atomic (.is().select().maybeSingle()) and
// simple (.eq() resolves) chains depending on which path the route takes.
function makeUpdateBuilder(result: { data: unknown; error: unknown } | null) {
  const resolved = result ?? { data: null, error: null };
  const builder: Record<string, unknown> = {
    eq: vi.fn(),
    is: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    // Thenable for branches that await the builder directly (non-atomic path)
    then: (resolve: (v: unknown) => unknown) => resolve(resolved),
  };
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.is = vi.fn().mockReturnValue(builder);
  builder.select = vi.fn().mockReturnValue(builder);
  return builder;
}

// Controls what the atomic update returns (claimed row vs duplicate)
let mockClaimedRow: { data: unknown; error: unknown } | null = {
  data: { id: "pay-1" },
  error: null,
};
const mockUpdateFn = vi.fn();
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
          update: (...args: unknown[]) => {
            mockUpdateFn(...args);
            return makeUpdateBuilder(mockClaimedRow);
          },
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

vi.mock("@/lib/classroom/enroll-from-payment", () => ({
  enrollBuyer: (...args: unknown[]) => mockEnrollDiplomadoBuyer(...args),
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
    mockEnrollDiplomadoBuyer.mockResolvedValue({ ok: true });
    // Default: atomic update claims the row (first success)
    mockClaimedRow = { data: { id: "pay-1" }, error: null };
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

  it("sends emails and enrolls buyer on first succeeded payment", async () => {
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

    expect(mockUpdateFn).toHaveBeenCalled();

    const { sendPaymentConfirmationEmail, sendPaymentTeamNotification } =
      await import("@/lib/email/payment-confirmation");
    expect(sendPaymentConfirmationEmail).toHaveBeenCalled();
    expect(sendPaymentTeamNotification).toHaveBeenCalled();
    expect(mockEnrollDiplomadoBuyer).toHaveBeenCalledWith({
      email: "juan@test.com",
      firstname: "Juan",
      lastname: "Pérez",
      plan: "contado",
    });
  });

  it("does not re-send emails or re-enroll for duplicate webhooks (atomic guard)", async () => {
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
    // Atomic UPDATE WHERE paid_at IS NULL returns null → already paid
    mockClaimedRow = { data: null, error: null };

    const res = await POST(makeFormRequest("token=dup-token"));
    expect(res.status).toBe(200);

    const { sendPaymentConfirmationEmail } = await import(
      "@/lib/email/payment-confirmation"
    );
    expect(sendPaymentConfirmationEmail).not.toHaveBeenCalled();
    expect(mockEnrollDiplomadoBuyer).not.toHaveBeenCalled();
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
    mockClaimedRow = { data: null, error: { message: "DB error" } };

    const res = await POST(makeFormRequest("token=err-token"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("db");
  });

  it("logs amount mismatch but still marks success", async () => {
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

  it("does not enroll for unrecognized plans", async () => {
    mockFetchFlowPaymentStatus.mockResolvedValue({
      ok: true,
      data: { status: 2, flowOrder: "F-UNK", amount: 360000 },
    });
    mockMapFlowStatus.mockReturnValue("succeeded");
    mockSelectPayment.mockResolvedValue({
      data: {
        id: "pay-unk",
        firstname: "María",
        lastname: "González",
        email: "maria@test.com",
        rut: "12345678-9",
        phone: "+56912345678",
        amount_clp: 360000,
        paid_at: null,
        plan: "unknown-plan",
        coupon_code: null,
        discount_clp: null,
      },
    });

    const res = await POST(makeFormRequest("token=unknown-plan-token"));
    expect(res.status).toBe(200);
    expect(mockEnrollDiplomadoBuyer).not.toHaveBeenCalled();
  });

  it("enrolls buyer for Programa de Liderazgo plans (lid-*)", async () => {
    mockFetchFlowPaymentStatus.mockResolvedValue({
      ok: true,
      data: { status: 2, flowOrder: "F-LID", amount: 360000 },
    });
    mockMapFlowStatus.mockReturnValue("succeeded");
    mockSelectPayment.mockResolvedValue({
      data: {
        id: "pay-lid",
        firstname: "María",
        lastname: "González",
        email: "maria@test.com",
        rut: "12345678-9",
        phone: "+56912345678",
        amount_clp: 360000,
        paid_at: null,
        plan: "lid-contado",
        coupon_code: null,
        discount_clp: null,
      },
    });

    const res = await POST(makeFormRequest("token=liderazgo-token"));
    expect(res.status).toBe(200);
    expect(mockEnrollDiplomadoBuyer).toHaveBeenCalledWith({
      email: "maria@test.com",
      firstname: "María",
      lastname: "González",
      plan: "lid-contado",
    });
  });

  it("handles failed payment status without sending emails", async () => {
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

    const res = await POST(makeFormRequest("token=fail-token"));
    expect(res.status).toBe(200);

    const { sendPaymentConfirmationEmail } = await import(
      "@/lib/email/payment-confirmation"
    );
    expect(sendPaymentConfirmationEmail).not.toHaveBeenCalled();
    expect(mockEnrollDiplomadoBuyer).not.toHaveBeenCalled();
  });
});
