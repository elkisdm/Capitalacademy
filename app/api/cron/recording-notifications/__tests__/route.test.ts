import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuthorizeCron = vi.fn();
const mockDispatchRecordingAvailableNotification = vi.fn();
const mockDispatchCapacitacionFollowup = vi.fn();

// Query builders de `lessons` y `capacitacion_followup_log` para el listado
// de reservas stale del cron. Todas las llamadas de filtro se registran;
// `.limit()` es la última del chain y resuelve la promesa con el resultado
// configurado por el test.
let mockLessonsResult: { data: unknown[] | null; error: unknown } = {
  data: [],
  error: null,
};
let mockLogsResult: { data: unknown[] | null; error: unknown } = {
  data: [],
  error: null,
};
let lessonsOrderArgs: unknown[] | undefined;
let lessonsLimitArg: number | undefined;
let logsOrderArgs: unknown[] | undefined;
let logsLimitArg: number | undefined;

function makeLessonsBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.not = () => builder;
  builder.is = () => builder;
  builder.lt = () => builder;
  builder.order = (...args: unknown[]) => {
    lessonsOrderArgs = args;
    return builder;
  };
  builder.limit = (...args: unknown[]) => {
    lessonsLimitArg = args[0] as number;
    return Promise.resolve(mockLessonsResult);
  };
  return builder;
}

function makeLogsBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.is = () => builder;
  builder.lt = () => builder;
  builder.order = (...args: unknown[]) => {
    logsOrderArgs = args;
    return builder;
  };
  builder.limit = (...args: unknown[]) => {
    logsLimitArg = args[0] as number;
    return Promise.resolve(mockLogsResult);
  };
  return builder;
}

vi.mock("@/lib/api/cron-auth", () => ({
  authorizeCron: (...args: unknown[]) => mockAuthorizeCron(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "lessons") return makeLessonsBuilder();
      if (table === "capacitacion_followup_log") return makeLogsBuilder();
      return {};
    },
  })),
}));

vi.mock("@/lib/classroom/recording-notifications", () => ({
  dispatchRecordingAvailableNotification: (...args: unknown[]) =>
    mockDispatchRecordingAvailableNotification(...args),
  dispatchCapacitacionFollowup: (...args: unknown[]) =>
    mockDispatchCapacitacionFollowup(...args),
  RETRY_STALE_MS: 10 * 60 * 1000,
}));

const { GET } = await import("@/app/api/cron/recording-notifications/route");

function makeRequest(withAuth = true) {
  return new Request("http://localhost/api/cron/recording-notifications", {
    method: "POST",
    headers: withAuth ? { Authorization: "Bearer test-secret" } : {},
  });
}

describe("GET /api/cron/recording-notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLessonsResult = { data: [], error: null };
    mockLogsResult = { data: [], error: null };
    lessonsOrderArgs = undefined;
    lessonsLimitArg = undefined;
    logsOrderArgs = undefined;
    logsLimitArg = undefined;
  });

  it("returns 401 when the cron request is not authorized", async () => {
    mockAuthorizeCron.mockReturnValue(false);

    const res = await GET(makeRequest(false));
    expect(res.status).toBe(401);
    expect(mockDispatchRecordingAvailableNotification).not.toHaveBeenCalled();
    expect(mockDispatchCapacitacionFollowup).not.toHaveBeenCalled();
  });

  it("orders lessons by recording_notified_at and caps at MAX_PER_RUN (10)", async () => {
    mockAuthorizeCron.mockReturnValue(true);

    await GET(makeRequest());

    expect(lessonsOrderArgs).toEqual(["recording_notified_at", { ascending: true }]);
    expect(lessonsLimitArg).toBe(10);
  });

  it("orders capacitacion_followup_log by sent_at and caps at MAX_PER_RUN (10)", async () => {
    mockAuthorizeCron.mockReturnValue(true);

    await GET(makeRequest());

    expect(logsOrderArgs).toEqual(["sent_at", { ascending: true }]);
    expect(logsLimitArg).toBe(10);
  });

  it("dispatches the recording-available notification once per stale lesson", async () => {
    mockAuthorizeCron.mockReturnValue(true);
    mockLessonsResult = { data: [{ id: "lesson-1" }, { id: "lesson-2" }], error: null };

    await GET(makeRequest());

    expect(mockDispatchRecordingAvailableNotification).toHaveBeenCalledTimes(2);
    expect(mockDispatchRecordingAvailableNotification).toHaveBeenCalledWith(
      expect.anything(),
      "lesson-1",
    );
    expect(mockDispatchRecordingAvailableNotification).toHaveBeenCalledWith(
      expect.anything(),
      "lesson-2",
    );
  });

  it("dispatches the CAP-CI followup once per stale log, resolving its lesson_id", async () => {
    mockAuthorizeCron.mockReturnValue(true);
    mockLogsResult = {
      data: [
        { session_id: "sess-1", class_sessions: { lesson_id: "lesson-9" } },
        { session_id: "sess-2", class_sessions: { lesson_id: null } },
      ],
      error: null,
    };

    const res = await GET(makeRequest());
    const json = await res.json();

    // La segunda fila no tiene lesson_id: no se despacha.
    expect(mockDispatchCapacitacionFollowup).toHaveBeenCalledTimes(1);
    expect(mockDispatchCapacitacionFollowup).toHaveBeenCalledWith(
      expect.anything(),
      "lesson-9",
    );
    expect(json).toEqual({ ok: true, generic: 0, capci: 2 });
  });
});
