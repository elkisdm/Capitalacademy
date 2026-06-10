import crypto from "node:crypto";

/**
 * Cobro genérico: el monto (y opcionalmente el concepto) viajan en la URL
 * (`?monto=200000&concepto=...&sig=...`) firmados con HMAC-SHA256. El servidor
 * re-verifica la firma antes de cobrar, de modo que el pagador NO puede alterar
 * el monto ni el concepto desde el navegador. El secreto vive solo en el
 * servidor (`COBRO_SIGNING_SECRET`).
 *
 * Compatibilidad: si no hay concepto, se firma SOLO el monto (esquema original),
 * para que los links generados antes de agregar concepto sigan siendo válidos.
 */
export const MAX_CONCEPTO_LEN = 60;

export function normalizeConcepto(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, MAX_CONCEPTO_LEN);
}

function cobroMessage(amountClp: number, concepto: string): string {
  return concepto ? `${amountClp}:${concepto}` : `${amountClp}`;
}

export function signCobro(
  amountClp: number,
  concepto: string | null | undefined,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(cobroMessage(amountClp, normalizeConcepto(concepto)))
    .digest("hex");
}

export function verifyCobro(
  amountClp: number,
  concepto: string | null | undefined,
  providedSig: string,
  secret: string,
): boolean {
  if (!Number.isInteger(amountClp) || amountClp <= 0) return false;
  // Una firma válida es SHA-256 en hex: exactamente 64 chars hexadecimales.
  if (!/^[0-9a-f]{64}$/i.test(providedSig)) return false;

  const expected = Buffer.from(signCobro(amountClp, concepto, secret), "hex");
  const provided = Buffer.from(providedSig, "hex");
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

// --- Compat: firma/verifica SOLO el monto (sin concepto). Usado por el script. ---
export function signCobroAmount(amountClp: number, secret: string): string {
  return signCobro(amountClp, null, secret);
}

export function verifyCobroAmount(
  amountClp: number,
  providedSig: string,
  secret: string,
): boolean {
  return verifyCobro(amountClp, null, providedSig, secret);
}

/**
 * Devuelve el secreto de firma solo si está configurado y es razonablemente
 * fuerte. `null` ⇒ el endpoint debe fallar cerrado (rechazar el cobro).
 */
export function getCobroSigningSecret(): string | null {
  const secret = process.env.COBRO_SIGNING_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}
