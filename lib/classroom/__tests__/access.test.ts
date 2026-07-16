import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetEnrollmentForUser = vi.fn();
const mockProfileSelect = vi.fn();
const mockCohortRoleSelect = vi.fn();

vi.mock("@/lib/classroom/queries", () => ({
  getEnrollmentForUser: (...args: unknown[]) =>
    mockGetEnrollmentForUser(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) =>
      table === "cohort_roles"
        ? {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  in: () => ({
                    limit: () => ({
                      maybeSingle: mockCohortRoleSelect,
                    }),
                  }),
                }),
              }),
            }),
          }
        : {
            select: () => ({
              eq: () => ({
                single: mockProfileSelect,
              }),
            }),
          },
  })),
}));

const { getClassroomAccess } = await import("@/lib/classroom/access");

const USER_ID = "user-uuid-1";
const COHORT_ID = "cohort-uuid-1";

const mockEnrollment = {
  id: "enrollment-uuid-1",
  status: "active",
  cohort_id: COHORT_ID,
};

describe("getClassroomAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns enrollment for an active student", async () => {
    mockGetEnrollmentForUser.mockResolvedValue(mockEnrollment);

    const result = await getClassroomAccess(USER_ID, COHORT_ID);

    expect(result).not.toBeNull();
    expect(result!.enrollment).toEqual(mockEnrollment);
    expect(result!.isStaff).toBe(false);
    // Should not need to query profiles if enrollment found
    expect(mockProfileSelect).not.toHaveBeenCalled();
  });

  it("returns null for a user with no enrollment and no staff role", async () => {
    mockGetEnrollmentForUser.mockResolvedValue(null);
    mockProfileSelect.mockResolvedValue({
      data: { role: "user", system_role: "user" },
    });
    mockCohortRoleSelect.mockResolvedValue({ data: null });

    const result = await getClassroomAccess(USER_ID, COHORT_ID);

    expect(result).toBeNull();
  });

  it("grants staff-preview access for a teacher of this cohort", async () => {
    mockGetEnrollmentForUser.mockResolvedValue(null);
    mockProfileSelect.mockResolvedValue({
      data: { role: "user", system_role: "user" },
    });
    mockCohortRoleSelect.mockResolvedValue({ data: { role: "teacher" } });

    const result = await getClassroomAccess(USER_ID, COHORT_ID);

    expect(result).not.toBeNull();
    expect(result!.enrollment).toBeNull();
    expect(result!.isStaff).toBe(true);
  });

  it("grants staff access for admin without enrollment", async () => {
    mockGetEnrollmentForUser.mockResolvedValue(null);
    mockProfileSelect.mockResolvedValue({
      data: { role: "admin", system_role: "admin" },
    });

    const result = await getClassroomAccess(USER_ID, COHORT_ID);

    expect(result).not.toBeNull();
    expect(result!.enrollment).toBeNull();
    expect(result!.isStaff).toBe(true);
  });

  it("grants staff access for ops without enrollment", async () => {
    mockGetEnrollmentForUser.mockResolvedValue(null);
    mockProfileSelect.mockResolvedValue({
      data: { role: "ops", system_role: "ops" },
    });

    const result = await getClassroomAccess(USER_ID, COHORT_ID);

    expect(result).not.toBeNull();
    expect(result!.isStaff).toBe(true);
  });

  it("returns null when profile cannot be fetched", async () => {
    mockGetEnrollmentForUser.mockResolvedValue(null);
    mockProfileSelect.mockResolvedValue({ data: null });
    mockCohortRoleSelect.mockResolvedValue({ data: null });

    const result = await getClassroomAccess(USER_ID, COHORT_ID);

    expect(result).toBeNull();
  });

  it("enrollment takes precedence over staff role", async () => {
    // Even if user is admin, if they have an enrollment, return as student
    mockGetEnrollmentForUser.mockResolvedValue(mockEnrollment);
    // profile select should never be called in this case
    mockProfileSelect.mockResolvedValue({
      data: { role: "admin", system_role: "admin" },
    });

    const result = await getClassroomAccess(USER_ID, COHORT_ID);

    expect(result!.isStaff).toBe(false);
    expect(result!.enrollment).toEqual(mockEnrollment);
  });
});
