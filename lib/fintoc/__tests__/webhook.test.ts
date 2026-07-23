import crypto from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyFintocSignature } from "@/lib/fintoc/webhook";

const SECRET = "whsec_test";
const RAW_BODY = JSON.stringify({ id: "evt_1", type: "checkout_session.updated" });

function buildSignatureHeader(rawBody: string, secret: string, ts: number) {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`)
    .digest("hex");
  return `t=${ts},v1=${signature}`;
}

describe("verifyFintocSignature", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("camino feliz: firma válida dentro de la tolerancia devuelve ok:true", () => {
    const now = Math.floor(Date.now() / 1000);
    const header = buildSignatureHeader(RAW_BODY, SECRET, now);

    const result = verifyFintocSignature({
      rawBody: RAW_BODY,
      signatureHeader: header,
      secret: SECRET,
    });

    expect(result).toEqual({ ok: true });
  });

  it("sin header de firma devuelve missing-signature", () => {
    const result = verifyFintocSignature({
      rawBody: RAW_BODY,
      signatureHeader: null,
      secret: SECRET,
    });

    expect(result).toEqual({ ok: false, reason: "missing-signature" });
  });

  it("header sin timestamp (falta t=) devuelve malformed-signature", () => {
    const header = "v1=abcdef";

    const result = verifyFintocSignature({
      rawBody: RAW_BODY,
      signatureHeader: header,
      secret: SECRET,
    });

    expect(result).toEqual({ ok: false, reason: "malformed-signature" });
  });

  it("header sin firma (falta v1=) devuelve malformed-signature", () => {
    const now = Math.floor(Date.now() / 1000);
    const header = `t=${now}`;

    const result = verifyFintocSignature({
      rawBody: RAW_BODY,
      signatureHeader: header,
      secret: SECRET,
    });

    expect(result).toEqual({ ok: false, reason: "malformed-signature" });
  });

  it("header completamente ilegible (sin '=') devuelve malformed-signature", () => {
    const result = verifyFintocSignature({
      rawBody: RAW_BODY,
      signatureHeader: "esto-no-es-un-header-valido",
      secret: SECRET,
    });

    expect(result).toEqual({ ok: false, reason: "malformed-signature" });
  });

  it("timestamp no numérico devuelve invalid-timestamp", () => {
    const header = "t=no-es-numero,v1=abcdef";

    const result = verifyFintocSignature({
      rawBody: RAW_BODY,
      signatureHeader: header,
      secret: SECRET,
    });

    expect(result).toEqual({ ok: false, reason: "invalid-timestamp" });
  });

  it("timestamp muy antiguo (fuera de tolerancia) devuelve stale-signature", () => {
    const staleTs = Math.floor(Date.now() / 1000) - 301; // tolerancia default = 300
    const header = buildSignatureHeader(RAW_BODY, SECRET, staleTs);

    const result = verifyFintocSignature({
      rawBody: RAW_BODY,
      signatureHeader: header,
      secret: SECRET,
    });

    expect(result).toEqual({ ok: false, reason: "stale-signature" });
  });

  it("timestamp en el futuro (fuera de tolerancia) devuelve stale-signature", () => {
    const futureTs = Math.floor(Date.now() / 1000) + 301;
    const header = buildSignatureHeader(RAW_BODY, SECRET, futureTs);

    const result = verifyFintocSignature({
      rawBody: RAW_BODY,
      signatureHeader: header,
      secret: SECRET,
    });

    expect(result).toEqual({ ok: false, reason: "stale-signature" });
  });

  it("respeta un toleranceSeconds custom más estricto que el default", () => {
    const ts = Math.floor(Date.now() / 1000) - 10;
    const header = buildSignatureHeader(RAW_BODY, SECRET, ts);

    const result = verifyFintocSignature({
      rawBody: RAW_BODY,
      signatureHeader: header,
      secret: SECRET,
      toleranceSeconds: 5,
    });

    expect(result).toEqual({ ok: false, reason: "stale-signature" });
  });

  it("firma con contenido incorrecto (mismo largo) devuelve signature-mismatch", () => {
    const now = Math.floor(Date.now() / 1000);
    // Firma válida en formato (misma longitud hex) pero calculada con otro secreto.
    const wrongSignature = crypto
      .createHmac("sha256", "otro-secreto")
      .update(`${now}.${RAW_BODY}`)
      .digest("hex");
    const header = `t=${now},v1=${wrongSignature}`;

    const result = verifyFintocSignature({
      rawBody: RAW_BODY,
      signatureHeader: header,
      secret: SECRET,
    });

    expect(result).toEqual({ ok: false, reason: "signature-mismatch" });
  });

  it("firma con largo distinto al esperado devuelve signature-mismatch", () => {
    const now = Math.floor(Date.now() / 1000);
    const header = `t=${now},v1=abcd`; // hex demasiado corto vs sha256 (64 chars)

    const result = verifyFintocSignature({
      rawBody: RAW_BODY,
      signatureHeader: header,
      secret: SECRET,
    });

    expect(result).toEqual({ ok: false, reason: "signature-mismatch" });
  });

  it("body alterado respecto al firmado devuelve signature-mismatch", () => {
    const now = Math.floor(Date.now() / 1000);
    const header = buildSignatureHeader(RAW_BODY, SECRET, now);

    const result = verifyFintocSignature({
      rawBody: RAW_BODY + " tampered",
      signatureHeader: header,
      secret: SECRET,
    });

    expect(result).toEqual({ ok: false, reason: "signature-mismatch" });
  });
});
