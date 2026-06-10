import crypto from "node:crypto";

/**
 * Cobro genérico: el monto viaja en la URL (`?monto=200000&sig=...`) firmado con
 * HMAC-SHA256. El servidor re-verifica la firma antes de cobrar, de modo que el
 * pagador NO puede alterar el monto desde el navegador (ej. `?monto=1`). El
 * secreto vive solo en el servidor (`COBRO_SIGNING_SECRET`).
 */
export function signCobroAmount(amountClp: number, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(String(amountClp))
    .digest("hex");
}

export function verifyCobroAmount(
  amountClp: number,
  providedSig: string,
  secret: string,
): boolean {
  if (!Number.isInteger(amountClp) || amountClp <= 0) return false;
  // Una firma válida es SHA-256 en hex: exactamente 64 chars hexadecimales.
  if (!/^[0-9a-f]{64}$/i.test(providedSig)) return false;

  const expected = Buffer.from(signCobroAmount(amountClp, secret), "hex");
  const provided = Buffer.from(providedSig, "hex");
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

/**
 * Devuelve el secreto de firma solo si está configurado y es razonablemente
 * fuerte. `null` ⇒ el endpoint debe fallar cerrado (rechazar el cobro).
 */
export function getCobroSigningSecret(): string | null {
  const secret = process.env.COBRO_SIGNING_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}
