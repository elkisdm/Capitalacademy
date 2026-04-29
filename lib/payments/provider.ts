export type PaymentProvider = "flow" | "fintoc";

export function getActivePaymentProvider(): PaymentProvider {
  const raw = process.env.PAYMENT_PROVIDER?.toLowerCase().trim();
  if (raw === "fintoc") return "fintoc";
  return "flow";
}
