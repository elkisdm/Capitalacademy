import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockSelectProfile = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: mockSelectProfile,
        }),
      }),
    }),
  })),
}));

const { authorizeAdmin, requireStaff } = await import(
  "@/lib/auth/authorize-admin"
);

function setupMocks(user: { id: string } | null, systemRole: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user },
  });
  mockSelectProfile.mockResolvedValue({
    data: systemRole ? { system_role: systemRole } : null,
  });
}

describe("authorizeAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no user session exists", async () => {
    setupMocks(null, null);
    const result = await authorizeAdmin();
    expect(result).toHaveProperty("error");
    expect(result.error!.status).toBe(401);
  });

  it("returns 403 when user has role 'user'", async () => {
    setupMocks({ id: "user-1" }, "user");
    const result = await authorizeAdmin();
    expect(result).toHaveProperty("error");
    expect(result.error!.status).toBe(403);
  });

  it("returns 403 when user has role 'teacher'", async () => {
    setupMocks({ id: "user-1" }, "teacher");
    const result = await authorizeAdmin();
    expect(result).toHaveProperty("error");
    expect(result.error!.status).toBe(403);
  });

  it("returns user when role is 'admin'", async () => {
    setupMocks({ id: "user-1" }, "admin");
    const result = await authorizeAdmin();
    expect(result).toHaveProperty("user");
    expect(result.user!.id).toBe("user-1");
  });

  it("returns user when role is 'ops'", async () => {
    setupMocks({ id: "user-1" }, "ops");
    const result = await authorizeAdmin();
    expect(result).toHaveProperty("user");
    expect(result.user!.id).toBe("user-1");
  });
});

describe("requireStaff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no user session exists", async () => {
    setupMocks(null, null);
    const result = await requireStaff();
    expect(result).toHaveProperty("error");
    expect(result.error!.status).toBe(401);
  });

  it("returns 403 when user has role 'user'", async () => {
    setupMocks({ id: "user-1" }, "user");
    const result = await requireStaff();
    expect(result).toHaveProperty("error");
    expect(result.error!.status).toBe(403);
  });

  it("allows role 'teacher'", async () => {
    setupMocks({ id: "user-1" }, "teacher");
    const result = await requireStaff();
    expect(result).toHaveProperty("user");
    expect(result.user!.id).toBe("user-1");
  });

  it("allows role 'ops'", async () => {
    setupMocks({ id: "user-1" }, "ops");
    const result = await requireStaff();
    expect(result).toHaveProperty("user");
  });

  it("allows role 'admin'", async () => {
    setupMocks({ id: "user-1" }, "admin");
    const result = await requireStaff();
    expect(result).toHaveProperty("user");
  });
});
