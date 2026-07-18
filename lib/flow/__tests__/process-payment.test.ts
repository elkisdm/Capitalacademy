import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnrollBuyer = vi.fn();
const mockSendEnrollmentFailureNotification = vi.fn();

vi.mock("@/lib/classroom/enroll-from-payment", () => ({
  enrollBuyer: (...args: unknown[]) => mockEnrollBuyer(...args),
}));

vi.mock("@/lib/email/payment-confirmation", () => ({
  sendPaymentConfirmationEmail: vi.fn(),
  sendPaymentTeamNotification: vi.fn(),
  sendEnrollmentFailureNotification: (...args: unknown[]) =>
    mockSendEnrollmentFailureNotification(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const { runPaymentEnrollment } = await import("@/lib/flow/process-payment");

// Query builder mínimo de `payments` para `runPaymentEnrollment`: espeja el
// patrón thenable real de supabase-js — `.eq(...)` es awaitable directamente
// (rama enrolled/failed) y también expone `.neq(...)` para la rama
// not_applicable (`update().eq().neq()`).
const updateCalls: Record<string, unknown>[] = [];

function makeAdmin() {
  return {
    from: (_table: string) => ({
      update: (patch: Record<string, unknown>) => {
        updateCalls.push(patch);
        return {
          eq: (..._eqArgs: unknown[]) => {
            const thenable = Promise.resolve({ error: null }) as Promise<{
              error: null;
            }> & { neq: (...args: unknown[]) => Promise<{ error: null }> };
            thenable.neq = (..._neqArgs: unknown[]) =>
              Promise.resolve({ error: null });
            return thenable;
          },
        };
      },
    }),
  } as unknown as Parameters<typeof runPaymentEnrollment>[0];
}

const basePayment = {
  id: "pay-1",
  firstname: "Nombre",
  lastname: "Apellido",
  email: "alumno@test.com",
  rut: "11.111.111-1",
  phone: "+56911111111",
  amount_clp: 500000,
  paid_at: "2026-07-17T00:00:00.000Z",
  plan: "contado" as string | null,
  coupon_code: null,
  coupon_id: null,
  discount_clp: null,
  document_type: "boleta",
  invoice_data: null,
};

describe("runPaymentEnrollment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
  });

  it("plan no matriculable → not_applicable sin llamar a enrollBuyer", async () => {
    const admin = makeAdmin();
    const result = await runPaymentEnrollment(
      admin,
      { ...basePayment, plan: null },
      0,
      "webhook",
    );

    expect(result).toBe("not_applicable");
    expect(mockEnrollBuyer).not.toHaveBeenCalled();
    expect(updateCalls).toEqual([{ enrollment_status: "not_applicable" }]);
  });

  it("matrícula exitosa → enrolled con enrolled_at seteado", async () => {
    mockEnrollBuyer.mockResolvedValue({ ok: true, userId: "user-1" });
    const admin = makeAdmin();

    const result = await runPaymentEnrollment(admin, basePayment, 0, "webhook");

    expect(result).toBe("enrolled");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({
      enrollment_status: "enrolled",
      enrollment_error: null,
    });
    expect(typeof updateCalls[0].enrolled_at).toBe("string");
    expect(mockSendEnrollmentFailureNotification).not.toHaveBeenCalled();
  });

  it("fallo en el primer intento (attempts=0) → failed, attempts=1, alerta enviada una vez", async () => {
    mockEnrollBuyer.mockResolvedValue({ ok: false, error: "no-active-cohort:diplomado" });
    const admin = makeAdmin();

    const result = await runPaymentEnrollment(admin, basePayment, 0, "webhook");

    expect(result).toBe("failed");
    expect(updateCalls[0]).toMatchObject({
      enrollment_status: "failed",
      enrollment_attempts: 1,
      enrollment_error: "no-active-cohort:diplomado",
    });
    expect(mockSendEnrollmentFailureNotification).toHaveBeenCalledTimes(1);
    expect(mockSendEnrollmentFailureNotification).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 1, exhausted: false }),
    );
  });

  it("fallo intermedio (attempts=3 → 4) → NO reenvía alerta", async () => {
    mockEnrollBuyer.mockResolvedValue({ ok: false, error: "no-active-cohort:diplomado" });
    const admin = makeAdmin();

    const result = await runPaymentEnrollment(admin, basePayment, 3, "cron");

    expect(result).toBe("failed");
    expect(updateCalls[0]).toMatchObject({ enrollment_attempts: 4 });
    expect(mockSendEnrollmentFailureNotification).not.toHaveBeenCalled();
  });

  it("último reintento (attempts=4 → 5) → alerta de reintentos agotados", async () => {
    mockEnrollBuyer.mockResolvedValue({ ok: false, error: "no-active-cohort:diplomado" });
    const admin = makeAdmin();

    const result = await runPaymentEnrollment(admin, basePayment, 4, "cron");

    expect(result).toBe("failed");
    expect(updateCalls[0]).toMatchObject({ enrollment_attempts: 5 });
    expect(mockSendEnrollmentFailureNotification).toHaveBeenCalledTimes(1);
    expect(mockSendEnrollmentFailureNotification).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 5, exhausted: true }),
    );
  });

  it("fallo de envío de correo de onboarding (error 'email: ...') se trata como failed", async () => {
    mockEnrollBuyer.mockResolvedValue({
      ok: false,
      error: "email: resend timeout",
      userId: "user-2",
    });
    const admin = makeAdmin();

    const result = await runPaymentEnrollment(admin, basePayment, 0, "webhook");

    expect(result).toBe("failed");
    expect(updateCalls[0]).toMatchObject({
      enrollment_status: "failed",
      enrollment_attempts: 1,
      enrollment_error: "email: resend timeout",
    });
  });
});
