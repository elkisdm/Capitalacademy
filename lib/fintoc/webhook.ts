import crypto from "node:crypto";

interface VerifyArgs {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  toleranceSeconds?: number;
}

/**
 * Verifica firma HMAC-SHA256 del webhook Fintoc.
 * Header esperado: `t=<unix_ts>,v1=<hex_signature>` (formato similar a Stripe).
 * Si Fintoc cambia el formato, ajustar parser pero mantener verificación
 * por timing-safe equal y tolerancia temporal.
 */
export function verifyFintocSignature({
  rawBody,
  signatureHeader,
  secret,
  toleranceSeconds = 300,
}: VerifyArgs): { ok: true } | { ok: false; reason: string } {
  if (!signatureHeader) {
    return { ok: false, reason: "missing-signature" };
  }
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k?.trim(), v?.trim()];
    }),
  );
  const ts = parts.t;
  const provided = parts.v1;
  if (!ts || !provided) {
    return { ok: false, reason: "malformed-signature" };
  }

  const tsNumber = Number(ts);
  if (!Number.isFinite(tsNumber)) {
    return { ok: false, reason: "invalid-timestamp" };
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNumber) > toleranceSeconds) {
    return { ok: false, reason: "stale-signature" };
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (
    expectedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return { ok: false, reason: "signature-mismatch" };
  }
  return { ok: true };
}

export type FintocWebhookEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string;
      status?: string;
      checkout_session?: { id?: string };
      metadata?: Record<string, string>;
    };
  };
};
