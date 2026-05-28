import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Controllable mock fns
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();
const mockVerifyEnrollment = vi.fn();
const mockComputeServerProgress = vi.fn();

// Supabase query builders — one per table
const mockVideoProgressSelectSingle = vi.fn();
const mockVideoProgressMaybeSingle = vi.fn();
const mockVideoProgressUpsertSingle = vi.fn();
const mockLessonSelectSingle = vi.fn();

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest)
// ---------------------------------------------------------------------------
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === "video_progress") {
        return {
          select: (..._args: unknown[]) => ({
            eq: (..._a: unknown[]) => ({
              eq: (..._b: unknown[]) => ({
                single: mockVideoProgressSelectSingle,
                maybeSingle: mockVideoProgressMaybeSingle,
              }),
            }),
          }),
          upsert: (..._args: unknown[]) => ({
            select: (..._s: unknown[]) => ({
              single: mockVideoProgressUpsertSingle,
            }),
          }),
        };
      }
      if (table === "lessons") {
        return {
          select: (..._args: unknown[]) => ({
            eq: (..._a: unknown[]) => ({
              single: mockLessonSelectSingle,
            }),
          }),
        };
      }
      return {};
    },
  })),
}));

vi.mock("@/lib/classroom/verify-enrollment", () => ({
  verifyEnrollment: (...args: unknown[]) => mockVerifyEnrollment(...args),
}));

vi.mock("@/lib/classroom/progress", () => ({
  computeServerProgress: (...args: unknown[]) =>
    mockComputeServerProgress(...args),
}));

// ---------------------------------------------------------------------------
// Import handlers AFTER mocks are wired
// ---------------------------------------------------------------------------
const { PATCH, POST } = await import(
  "@/app/api/classroom/progress/route"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const VALID_UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ENROLLMENT_ID = "11111111-2222-4333-8444-555555555555";
const USER = { id: "00000000-1111-4222-8333-444444444444" };

function makeRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/classroom/progress", {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// PATCH /api/classroom/progress
// ===========================================================================
describe("PATCH /api/classroom/progress", () => {
  // ---- auth ----------------------------------------------------------------
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await PATCH(makeRequest("PATCH", { lessonId: VALID_UUID }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
  });

  // ---- validation ----------------------------------------------------------
  it("returns 422 when lessonId is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });

    const res = await PATCH(
      makeRequest("PATCH", {
        playbackPositionSeconds: 10,
        durationSeconds: 100,
      }),
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
  });

  it("returns 422 when durationSeconds is 0", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });

    const res = await PATCH(
      makeRequest("PATCH", {
        lessonId: VALID_UUID,
        playbackPositionSeconds: 10,
        durationSeconds: 0,
      }),
    );

    expect(res.status).toBe(422);
  });

  it("returns 422 when durationSeconds is negative", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });

    const res = await PATCH(
      makeRequest("PATCH", {
        lessonId: VALID_UUID,
        playbackPositionSeconds: 10,
        durationSeconds: -5,
      }),
    );

    expect(res.status).toBe(422);
  });

  it("returns 422 when playbackPositionSeconds is negative", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });

    const res = await PATCH(
      makeRequest("PATCH", {
        lessonId: VALID_UUID,
        playbackPositionSeconds: -1,
        durationSeconds: 100,
      }),
    );

    expect(res.status).toBe(422);
  });

  // ---- enrollment ----------------------------------------------------------
  it("returns 403 when enrollment not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockVerifyEnrollment.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest("PATCH", {
        lessonId: VALID_UUID,
        playbackPositionSeconds: 30,
        durationSeconds: 600,
      }),
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("matrícula");
  });

  // ---- success -------------------------------------------------------------
  it("returns progress data on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockVerifyEnrollment.mockResolvedValue(ENROLLMENT_ID);

    // existing progress row (or null)
    mockVideoProgressSelectSingle.mockResolvedValue({
      data: { max_position_seconds: 20, completed: false, completed_at: null },
    });

    const computedProgress = {
      playback_position_seconds: 30,
      duration_seconds: 600,
      max_position_seconds: 30,
      watch_percentage: 5,
      completed: false,
      last_watched_at: new Date().toISOString(),
    };
    mockComputeServerProgress.mockReturnValue(computedProgress);

    const upsertedRow = {
      watch_percentage: 5,
      completed: false,
      max_position_seconds: 30,
      playback_position_seconds: 30,
    };
    mockVideoProgressUpsertSingle.mockResolvedValue({
      data: upsertedRow,
      error: null,
    });

    const res = await PATCH(
      makeRequest("PATCH", {
        lessonId: VALID_UUID,
        playbackPositionSeconds: 30,
        durationSeconds: 600,
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(upsertedRow);
    expect(mockVerifyEnrollment).toHaveBeenCalledWith(USER.id, VALID_UUID);
    expect(mockComputeServerProgress).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// POST /api/classroom/progress  (manual complete)
// ===========================================================================
describe("POST /api/classroom/progress", () => {
  // ---- auth ----------------------------------------------------------------
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest("POST", { lessonId: VALID_UUID }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("No autenticado");
  });

  // ---- validation ----------------------------------------------------------
  it("returns 422 when lessonId is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });

    const res = await POST(makeRequest("POST", {}));

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
  });

  it("returns 422 when lessonId is not a UUID", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });

    const res = await POST(makeRequest("POST", { lessonId: "not-a-uuid" }));

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("Validación fallida");
  });

  // ---- enrollment ----------------------------------------------------------
  it("returns 403 when enrollment not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockVerifyEnrollment.mockResolvedValue(null);

    const res = await POST(makeRequest("POST", { lessonId: VALID_UUID }));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("matrícula");
  });

  // ---- success -------------------------------------------------------------
  it("returns progress data on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } });
    mockVerifyEnrollment.mockResolvedValue(ENROLLMENT_ID);

    mockLessonSelectSingle.mockResolvedValue({
      data: { video_duration_seconds: 600 },
    });

    mockVideoProgressMaybeSingle.mockResolvedValue({
      data: null,
    });

    const upsertedRow = { watch_percentage: 100, completed: true };
    mockVideoProgressUpsertSingle.mockResolvedValue({
      data: upsertedRow,
      error: null,
    });

    const res = await POST(makeRequest("POST", { lessonId: VALID_UUID }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(upsertedRow);
    expect(json.watch_percentage).toBe(100);
    expect(json.completed).toBe(true);
    expect(mockVerifyEnrollment).toHaveBeenCalledWith(USER.id, VALID_UUID);
  });
});
