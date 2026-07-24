import { describe, it, expect } from "vitest";
import { getActivePaymentProvider } from "@/lib/payments/provider";

describe("getActivePaymentProvider", () => {
  it("retorna flow como proveedor de pago activo", () => {
    expect(getActivePaymentProvider()).toBe("flow");
  });
});
