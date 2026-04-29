import crypto from "node:crypto";

export type FlowParamValue = string | number | undefined | null;
export type FlowParams = Record<string, FlowParamValue>;

// Flow firma concatenando los parámetros ordenados alfabéticamente como
// `key1value1key2value2...` y aplicando HMAC-SHA256 con el secretKey.
export function signFlowParams(
  params: FlowParams,
  secretKey: string,
): { signature: string; clean: Record<string, string> } {
  const clean: Record<string, string> = {};
  for (const key of Object.keys(params)) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    clean[key] = String(value);
  }
  const sortedKeys = Object.keys(clean).sort();
  const toSign = sortedKeys.map((k) => `${k}${clean[k]}`).join("");
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(toSign)
    .digest("hex");
  return { signature, clean };
}

export function verifyFlowSignature(
  params: FlowParams,
  providedSignature: string,
  secretKey: string,
): boolean {
  const { clean } = signFlowParams(params, secretKey);
  const sortedKeys = Object.keys(clean).sort();
  const toSign = sortedKeys.map((k) => `${k}${clean[k]}`).join("");
  const expected = crypto
    .createHmac("sha256", secretKey)
    .update(toSign)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(providedSignature, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
