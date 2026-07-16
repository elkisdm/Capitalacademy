import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthorizeCron = vi.fn();
const mockFetchFlowPaymentStatus = vi.fn();
const mockFetchFlowPaymentStatusByCommerceId = vi.fn();
const mockMapFlowStatus = vi.fn();
const mockProcessFlowPayment = vi.fn();

// Query builder de `payments` para el listado de candidatos del cron. Todas
// las llamadas de filtro (.eq/.lte/.gte/.order) se registran para poder
// verificar la ventana temporal; `.limit()` es la última del chain y resuelve
// la promesa con el resultado configurado por el test.
let mockCandidatesResult: { data: unknown[] | null; error: unknown } = {
  data: [],
  error: null,
};
const eqCalls: unknown[][] = [];
let lteArg: string | undefined;
let gteArg: string | undefined;
let orderArgs: unknown[] | undefined;

function makeCandidatesBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (...args: unknown[]) => {
    eqCalls.push(args);
    return builder;
  };
  builder.lte = (...args: unknown[]) => {
    lteArg = args[1] as string;
    return builder;
  };
  builder.gte = (...args: unknown[]) => {
    gteArg = args[1] as string;
    return builder;
  };
  builder.order = (...args: unknown[]) => {
    orderArgs = args;
    return builder;
  };
  builder.limit = () => Promise.resolve(mockCandidatesResult);
  return builder;
}

vi.mock("@/lib/api/cron-auth", () => ({
  authorizeCron: (...args: unknown[]) => mockAuthorizeCron(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "payments") return makeCandidatesBuilder();
      return {};
    },
  })),
}));

vi.mock("@/lib/flow/status", () => ({
  fetchFlowPaymentStatus: (...args: unknown[]) =>
    mockFetchFlowPaymentStatus(...args),
  fetchFlowPaymentStatusByCommerceId: (...args: unknown[]) =>
    mockFetchFlowPaymentStatusByCommerceId(...args),
  mapFlowStatus: (...args: unknown[]) => mockMapFlowStatus(...args),
}));

vi.mock("@/lib/flow/process-payment", () => ({
  processFlowPayment: (...args: unknown[]) => mockProcessFlowPayment(...args),
}));

const { GET } = await import("@/app/api/cron/flow-reconcile/route");

function makeRequest(withAuth = true) {
  return new Request("http://localhost/api/cron/flow-reconcile", {
    method: "POST",
    headers: withAuth ? { Authorization: "Bearer test-secret" } : {},
  });
}

describe("GET /api/cron/flow-reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCandidatesResult = { data: [], error: null };
    eqCalls.length = 0;
    lteArg = undefined;
    gteArg = undefined;
    orderArgs = undefined;
  });

  it("returns 401 when the cron request is not authorized", async () => {
    mockAuthorizeCron.mockReturnValue(false);

    const res = await GET(makeRequest(false));
    expect(res.status).toBe(401);
    expect(mockFetchFlowPaymentStatusByCommerceId).not.toHaveBeenCalled();
  });

  it("recovers a pending payment whose Flow status is now paid (status=2)", async () => {
    mockAuthorizeCron.mockReturnValue(true);
    mockCandidatesResult = {
      data: [
        {
          id: "pay-1",
          commerce_order: "CA-abc12345-xyz",
          flow_token: null,
          amount_clp: 500000,
        },
      ],
      error: null,
    };
    mockFetchFlowPaymentStatusByCommerceId.mockResolvedValue({
      ok: true,
      data: { status: 2, flowOrder: 1, amount: 500000 },
    });
    mockMapFlowStatus.mockReturnValue("succeeded");
    mockProcessFlowPayment.mockResolvedValue({
      ok: true,
      firstSuccess: true,
      status: "succeeded",
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, checked: 1, recovered: 1, closed: 0 });
    expect(mockProcessFlowPayment).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pay-1" }),
      expect.anything(),
      "cron",
    );
  });

  it("does not recover a payment that is still pending in Flow (status=1)", async () => {
    mockAuthorizeCron.mockReturnValue(true);
    mockCandidatesResult = {
      data: [
        {
          id: "pay-2",
          commerce_order: "CA-def67890-xyz",
          flow_token: null,
          amount_clp: 500000,
        },
      ],
      error: null,
    };
    mockFetchFlowPaymentStatusByCommerceId.mockResolvedValue({
      ok: true,
      data: { status: 1, flowOrder: 2, amount: 500000 },
    });
    mockMapFlowStatus.mockReturnValue("pending");

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json).toEqual({ ok: true, checked: 1, recovered: 0, closed: 0 });
    expect(mockProcessFlowPayment).not.toHaveBeenCalled();
  });

  it("closes a payment rejected in Flow (status=3) without counting it as recovered", async () => {
    mockAuthorizeCron.mockReturnValue(true);
    mockCandidatesResult = {
      data: [
        {
          id: "pay-3",
          commerce_order: "CA-ghi11111-xyz",
          flow_token: null,
          amount_clp: 500000,
        },
      ],
      error: null,
    };
    mockFetchFlowPaymentStatusByCommerceId.mockResolvedValue({
      ok: true,
      data: { status: 3, flowOrder: 3, amount: 500000 },
    });
    mockMapFlowStatus.mockReturnValue("failed");
    mockProcessFlowPayment.mockResolvedValue({
      ok: true,
      firstSuccess: false,
      status: "failed",
    });

    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json).toEqual({ ok: true, checked: 1, recovered: 0, closed: 1 });
    expect(mockProcessFlowPayment).toHaveBeenCalled();
  });

  it("uses getStatusByCommerceId (not flow_token) when commerce_order is present", async () => {
    mockAuthorizeCron.mockReturnValue(true);
    mockCandidatesResult = {
      data: [
        {
          id: "pay-4",
          commerce_order: "CA-jkl22222-xyz",
          flow_token: null,
          amount_clp: 266700,
        },
      ],
      error: null,
    };
    mockFetchFlowPaymentStatusByCommerceId.mockResolvedValue({
      ok: true,
      data: { status: 2, flowOrder: 4, amount: 266700 },
    });
    mockMapFlowStatus.mockReturnValue("succeeded");
    mockProcessFlowPayment.mockResolvedValue({
      ok: true,
      firstSuccess: true,
      status: "succeeded",
    });

    await GET(makeRequest());

    expect(mockFetchFlowPaymentStatusByCommerceId).toHaveBeenCalledWith(
      "CA-jkl22222-xyz",
    );
    expect(mockFetchFlowPaymentStatus).not.toHaveBeenCalled();
  });

  it("falls back to flow_token when commerce_order is null", async () => {
    mockAuthorizeCron.mockReturnValue(true);
    mockCandidatesResult = {
      data: [
        {
          id: "pay-5",
          commerce_order: null,
          flow_token: "legacy-token",
          amount_clp: 100000,
        },
      ],
      error: null,
    };
    mockFetchFlowPaymentStatus.mockResolvedValue({
      ok: true,
      data: { status: 1, flowOrder: 5, amount: 100000 },
    });
    mockMapFlowStatus.mockReturnValue("pending");

    await GET(makeRequest());

    expect(mockFetchFlowPaymentStatus).toHaveBeenCalledWith("legacy-token");
    expect(mockFetchFlowPaymentStatusByCommerceId).not.toHaveBeenCalled();
  });

  it("queries the payments window between 15 minutes and 30 days ago", async () => {
    mockAuthorizeCron.mockReturnValue(true);
    const before = Date.now();

    await GET(makeRequest());

    const after = Date.now();
    expect(lteArg).toBeDefined();
    expect(gteArg).toBeDefined();

    const upperMs = new Date(lteArg as string).getTime();
    const lowerMs = new Date(gteArg as string).getTime();
    const TOLERANCE_MS = 2000;

    expect(upperMs).toBeGreaterThanOrEqual(before - 15 * 60_000 - TOLERANCE_MS);
    expect(upperMs).toBeLessThanOrEqual(after - 15 * 60_000 + TOLERANCE_MS);

    expect(lowerMs).toBeGreaterThanOrEqual(
      before - 30 * 86_400_000 - TOLERANCE_MS,
    );
    expect(lowerMs).toBeLessThanOrEqual(after - 30 * 86_400_000 + TOLERANCE_MS);

    // Filtra por status pending y provider flow.
    expect(eqCalls).toContainEqual(["status", "pending"]);
    expect(eqCalls).toContainEqual(["provider", "flow"]);
  });

  it("prioritizes the newest pending payments (ascending: false), not the oldest", async () => {
    // Si hay más pendientes que MAX_PER_RUN dentro de la ventana, los pagos
    // más viejos ya perdieron la carrera en corridas previas; los nuevos son
    // los recuperables. Ver ADR-0021.
    mockAuthorizeCron.mockReturnValue(true);

    await GET(makeRequest());

    expect(orderArgs).toEqual(["created_at", { ascending: false }]);
  });
});
