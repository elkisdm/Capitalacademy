import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockStorage = {
  from: vi.fn(() => ({
    upload: vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.example.com/signed-cert.pdf" },
      error: null,
    }),
  })),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
    storage: mockStorage,
  })),
}));

vi.mock("@/lib/certificates/generate-pdf", () => ({
  generateCertificatePdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

vi.mock("@/lib/email/certificate", () => ({
  sendCertificateEmail: vi.fn(async () => ({ success: true })),
}));

const { issueCertificate } = await import(
  "@/lib/certificates/issue-certificate"
);

function createChainMock(resolvedData: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: resolvedData, error });
  const eq = vi.fn().mockReturnValue({ single, eq: vi.fn().mockReturnValue({ single }) });
  const select = vi.fn().mockReturnValue({ eq });
  return { select, single, eq };
}

describe("issueCertificate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when enrollment is not found", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
        }),
      }),
    });

    await expect(issueCertificate("bad-enrollment")).rejects.toThrow(
      "Enrollment not found",
    );
  });

  it("throws when no active certificate template exists", async () => {
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "enrollments") {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "enr-1",
                  student_id: "student-1",
                  cohort_id: "cohort-1",
                  cohorts: {
                    program_id: "prog-1",
                    programs: { id: "prog-1", name: "Diplomado" },
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: { full_name: "Juan Pérez", email: "juan@test.com" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "certificate_templates") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
              }),
            }),
          }),
        };
      }
      return createChainMock(null).select().eq();
    });

    await expect(issueCertificate("enr-1")).rejects.toThrow(
      "No active certificate template",
    );
  });

  it("completes the full certificate issuance flow", async () => {
    const insertedCertId = "cert-123";

    mockFrom.mockImplementation((table: string) => {
      if (table === "enrollments") {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "enr-1",
                  student_id: "student-1",
                  cohort_id: "cohort-1",
                  cohorts: {
                    program_id: "prog-1",
                    programs: { id: "prog-1", name: "Diplomado Test" },
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: vi.fn().mockResolvedValue({
                data: { full_name: "María González", email: "maria@test.com" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "certificate_templates") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    template_png_path: "/templates/cert.png",
                    font_path: "/fonts/allura.ttf",
                    name_center_x: 400,
                    name_baseline_y: 300,
                    default_font_size: 48,
                    min_font_size: 24,
                    max_name_width: 600,
                    name_color_hex: "#14163a",
                    is_active: true,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "certificates") {
        return {
          insert: () => ({
            select: () => ({
              single: vi
                .fn()
                .mockResolvedValue({
                  data: { id: insertedCertId },
                  error: null,
                }),
            }),
          }),
          update: () => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    });

    const result = await issueCertificate("enr-1", "attempt-1");

    expect(result.certificateId).toBe(insertedCertId);
    expect(result.verificationCode).toMatch(/^[A-Z2-9]{8}$/);
    expect(result.pdfUrl).toBe("https://storage.example.com/signed-cert.pdf");
  });
});
