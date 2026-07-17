import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthorizeCron = vi.fn();
const mockNotifyDeliverableOpen = vi.fn();

// Query builder de `deliverables` para el listado de candidatos del cron.
// Todas las llamadas de filtro se registran; `.limit()` es la última del
// chain y resuelve la promesa con el resultado configurado por el test.
let mockPendingResult: { data: unknown[] | null; error: unknown } = {
  data: [],
  error: null,
};
let orderArgs: unknown[] | undefined;
let limitArg: number | undefined;

function makePendingBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.is = () => builder;
  builder.lte = () => builder;
  builder.order = (...args: unknown[]) => {
    orderArgs = args;
    return builder;
  };
  builder.limit = (...args: unknown[]) => {
    limitArg = args[0] as number;
    return Promise.resolve(mockPendingResult);
  };
  return builder;
}

vi.mock("@/lib/api/cron-auth", () => ({
  authorizeCron: (...args: unknown[]) => mockAuthorizeCron(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "deliverables") return makePendingBuilder();
      return {};
    },
  })),
}));

vi.mock("@/lib/deliverables/notify", () => ({
  notifyDeliverableOpen: (...args: unknown[]) => mockNotifyDeliverableOpen(...args),
}));

const { GET } = await import("@/app/api/cron/deliverable-openings/route");

function makeRequest(withAuth = true) {
  return new Request("http://localhost/api/cron/deliverable-openings", {
    method: "POST",
    headers: withAuth ? { Authorization: "Bearer test-secret" } : {},
  });
}

describe("GET /api/cron/deliverable-openings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPendingResult = { data: [], error: null };
    orderArgs = undefined;
    limitArg = undefined;
  });

  it("returns 401 when the cron request is not authorized", async () => {
    mockAuthorizeCron.mockReturnValue(false);

    const res = await GET(makeRequest(false));
    expect(res.status).toBe(401);
    expect(mockNotifyDeliverableOpen).not.toHaveBeenCalled();
  });

  it("orders by opens_at ascending and caps the query at MAX_PER_RUN (10)", async () => {
    mockAuthorizeCron.mockReturnValue(true);

    await GET(makeRequest());

    expect(orderArgs).toEqual(["opens_at", { ascending: true }]);
    expect(limitArg).toBe(10);
  });

  it("calls notifyDeliverableOpen once per candidate", async () => {
    mockAuthorizeCron.mockReturnValue(true);
    mockPendingResult = {
      data: [{ id: "del-1" }, { id: "del-2" }],
      error: null,
    };
    mockNotifyDeliverableOpen.mockResolvedValue({ skipped: false, sent: 3 });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(mockNotifyDeliverableOpen).toHaveBeenCalledTimes(2);
    expect(mockNotifyDeliverableOpen).toHaveBeenCalledWith("del-1");
    expect(mockNotifyDeliverableOpen).toHaveBeenCalledWith("del-2");
    expect(json).toEqual({ ok: true, processed: 2, sent: 6 });
  });
});
