import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cobertura de `lib/coupons/validate.ts`: normalización de código,
 * `lookupCoupon` (error del proveedor, código vacío/no encontrado, inactivo,
 * ventana de vigencia, cupo agotado, camino feliz), `couponPreview` y
 * `applyCouponToAmount` (redondeo del descuento).
 *
 * Se mockea SOLO el borde externo: `@/lib/supabase/admin` (createAdminClient).
 * El builder encadenable simula `.from().select().eq().maybeSingle()` y
 * resuelve con lo que cada test configure en `mockResult`.
 */

let mockResult: { data: unknown; error: unknown } = { data: null, error: null };
const calls: Array<[string, ...unknown[]]> = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      calls.push(["from", table]);
      const builder: Record<string, unknown> = {};
      builder.select = (...args: unknown[]) => {
        calls.push(["select", ...args]);
        return builder;
      };
      builder.eq = (...args: unknown[]) => {
        calls.push(["eq", ...args]);
        return builder;
      };
      builder.maybeSingle = () => Promise.resolve(mockResult);
      return builder;
    },
  }),
}));

import {
  normalizeCouponCode,
  lookupCoupon,
  couponPreview,
  applyCouponToAmount,
} from "@/lib/coupons/validate";
import type { CouponRow } from "@/lib/coupons/types";

function baseCoupon(overrides: Partial<CouponRow> = {}): CouponRow {
  return {
    id: "c1",
    code: "PROMO10",
    percent_off: 10,
    label: "Promo 10%",
    valid_from: null,
    valid_until: null,
    max_redemptions: null,
    redemptions: 0,
    active: true,
    ...overrides,
  };
}

beforeEach(() => {
  mockResult = { data: null, error: null };
  calls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("normalizeCouponCode", () => {
  it("recorta espacios y pasa a mayúsculas", () => {
    expect(normalizeCouponCode("  promo10 ")).toBe("PROMO10");
  });

  it("deja igual un código ya normalizado", () => {
    expect(normalizeCouponCode("YA-OK")).toBe("YA-OK");
  });
});

describe("lookupCoupon", () => {
  it("rechaza código vacío (tras trim) sin llegar a Supabase", async () => {
    const result = await lookupCoupon("   ");
    expect(result).toEqual({ ok: false, error: "Código vacío.", status: 400 });
    expect(calls).toHaveLength(0);
  });

  it("devuelve 500 si Supabase responde error", async () => {
    mockResult = { data: null, error: { message: "conexión caída" } };
    const result = await lookupCoupon("PROMO10");
    expect(result).toEqual({
      ok: false,
      error: "No pudimos validar el cupón.",
      status: 500,
    });
  });

  it("devuelve 404 si no existe el código", async () => {
    mockResult = { data: null, error: null };
    const result = await lookupCoupon("NOEXISTE");
    expect(result).toEqual({ ok: false, error: "Cupón no válido.", status: 404 });
  });

  it("devuelve 410 si el cupón está inactivo", async () => {
    mockResult = { data: baseCoupon({ active: false }), error: null };
    const result = await lookupCoupon("PROMO10");
    expect(result).toEqual({
      ok: false,
      error: "Cupón no disponible.",
      status: 410,
    });
  });

  it("devuelve 410 si aún no es vigente (valid_from futuro)", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    mockResult = { data: baseCoupon({ valid_from: future }), error: null };
    const result = await lookupCoupon("PROMO10");
    expect(result).toEqual({
      ok: false,
      error: "Cupón aún no vigente.",
      status: 410,
    });
  });

  it("devuelve 410 si ya expiró (valid_until pasado)", async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    mockResult = { data: baseCoupon({ valid_until: past }), error: null };
    const result = await lookupCoupon("PROMO10");
    expect(result).toEqual({ ok: false, error: "Cupón expirado.", status: 410 });
  });

  it("devuelve 410 si se agotaron las redenciones (redemptions >= max)", async () => {
    mockResult = {
      data: baseCoupon({ max_redemptions: 5, redemptions: 5 }),
      error: null,
    };
    const result = await lookupCoupon("PROMO10");
    expect(result).toEqual({ ok: false, error: "Cupón agotado.", status: 410 });
  });

  it("permite cupón con cupo restante (redemptions < max)", async () => {
    const coupon = baseCoupon({ max_redemptions: 5, redemptions: 4 });
    mockResult = { data: coupon, error: null };
    const result = await lookupCoupon("PROMO10");
    expect(result).toEqual({ ok: true, coupon });
  });

  it("camino feliz: vigente, activo, sin límite de redenciones y normaliza el código de entrada", async () => {
    const coupon = baseCoupon();
    mockResult = { data: coupon, error: null };
    const result = await lookupCoupon("  promo10  ");
    expect(result).toEqual({ ok: true, coupon });
    // Verifica que se consultó con el código normalizado, no el crudo.
    expect(calls).toContainEqual(["eq", "code", "PROMO10"]);
  });

  it("acepta un cupón dentro de la ventana de vigencia (valid_from pasado y valid_until futuro)", async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    const coupon = baseCoupon({ valid_from: past, valid_until: future });
    mockResult = { data: coupon, error: null };
    const result = await lookupCoupon("PROMO10");
    expect(result).toEqual({ ok: true, coupon });
  });
});

describe("couponPreview", () => {
  it("proyecta solo los campos públicos del cupón", () => {
    const coupon = baseCoupon({ id: "c9", code: "ABC", percent_off: 20, label: "20 off" });
    expect(couponPreview(coupon)).toEqual({
      id: "c9",
      code: "ABC",
      percentOff: 20,
      label: "20 off",
    });
  });

  it("propaga label null", () => {
    const coupon = baseCoupon({ label: null });
    expect(couponPreview(coupon).label).toBeNull();
  });
});

describe("applyCouponToAmount", () => {
  it("calcula descuento y monto final redondeando al entero más cercano", () => {
    // 12345 * 15% = 1851.75 -> redondea a 1852
    const coupon = baseCoupon({ percent_off: 15 });
    const result = applyCouponToAmount(coupon, 12345);
    expect(result).toEqual({
      id: coupon.id,
      code: coupon.code,
      percentOff: 15,
      discountClp: 1852,
      finalAmountClp: 12345 - 1852,
    });
  });

  it("con 100% de descuento el monto final es 0, nunca negativo", () => {
    const coupon = baseCoupon({ percent_off: 100 });
    const result = applyCouponToAmount(coupon, 5000);
    expect(result.discountClp).toBe(5000);
    expect(result.finalAmountClp).toBe(0);
  });

  it("con 0% de descuento el monto final queda igual al original", () => {
    const coupon = baseCoupon({ percent_off: 0 });
    const result = applyCouponToAmount(coupon, 5000);
    expect(result.discountClp).toBe(0);
    expect(result.finalAmountClp).toBe(5000);
  });
});
