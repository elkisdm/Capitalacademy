import { describe, it, expect } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { normalizeEgressInfo, verifyLiveKitWebhook } from "@/lib/livekit/webhook";

/**
 * Verificación del webhook de LiveKit (E11 de la spec).
 *
 * Es una frontera de confianza: por esta URL entra lo que crea assets en Mux y
 * cierra grabaciones. Si esto se afloja, cualquiera que sepa la URL puede
 * mandar un `egress_ended`.
 */

const API_KEY = "APIkey";
const API_SECRET = "secreto-de-prueba";

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function firmar(rawBody: string, opts?: { iss?: string; exp?: number; sha256?: string }): string {
  const ahora = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: opts?.iss ?? API_KEY,
      exp: opts?.exp ?? ahora + 300,
      nbf: ahora - 10,
      sha256: opts?.sha256 ?? createHash("sha256").update(rawBody, "utf8").digest("base64"),
    }),
  );
  const firma = b64url(createHmac("sha256", API_SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${firma}`;
}

const CUERPO = JSON.stringify({
  event: "egress_ended",
  egressInfo: { egressId: "EG_1", roomName: "clase-ses-1", status: "EGRESS_COMPLETE" },
});

describe("verifyLiveKitWebhook", () => {
  it("acepta una firma válida y devuelve el evento", () => {
    const r = verifyLiveKitWebhook(CUERPO, firmar(CUERPO), API_KEY, API_SECRET);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.event.event).toBe("egress_ended");
    expect(r.event.egressInfo?.egressId).toBe("EG_1");
  });

  it("acepta el token con prefijo Bearer", () => {
    expect(verifyLiveKitWebhook(CUERPO, `Bearer ${firmar(CUERPO)}`, API_KEY, API_SECRET).ok).toBe(
      true,
    );
  });

  it("rechaza cuando no viene la cabecera", () => {
    const r = verifyLiveKitWebhook(CUERPO, null, API_KEY, API_SECRET);
    expect(r).toMatchObject({ ok: false });
  });

  it("rechaza una firma adulterada", () => {
    const token = firmar(CUERPO);
    const roto = `${token.slice(0, -4)}xxxx`;
    expect(verifyLiveKitWebhook(CUERPO, roto, API_KEY, API_SECRET).ok).toBe(false);
  });

  it("rechaza un token firmado con otro secreto", () => {
    expect(verifyLiveKitWebhook(CUERPO, firmar(CUERPO), API_KEY, "otro-secreto").ok).toBe(false);
  });

  it("rechaza un emisor que no es nuestra api key", () => {
    const r = verifyLiveKitWebhook(CUERPO, firmar(CUERPO, { iss: "OTRA" }), API_KEY, API_SECRET);
    expect(r).toMatchObject({ ok: false, reason: "emisor desconocido" });
  });

  it("rechaza un token vencido", () => {
    const exp = Math.floor(Date.now() / 1000) - 3600;
    const r = verifyLiveKitWebhook(CUERPO, firmar(CUERPO, { exp }), API_KEY, API_SECRET);
    expect(r).toMatchObject({ ok: false, reason: "token vencido" });
  });

  it("RECHAZA un token válido pegado a otro cuerpo", () => {
    // El caso que hace que verificar solo el JWT no baste: la firma sigue
    // siendo legítima, pero el mensaje ya no es el que se firmó.
    const otroCuerpo = JSON.stringify({
      event: "egress_ended",
      egressInfo: { egressId: "EG_INVENTADO", status: "EGRESS_COMPLETE" },
    });
    const r = verifyLiveKitWebhook(otroCuerpo, firmar(CUERPO), API_KEY, API_SECRET);
    expect(r).toMatchObject({ ok: false, reason: "el cuerpo no coincide con la firma" });
  });

  it("rechaza un token sin el hash del cuerpo", () => {
    const ahora = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = b64url(JSON.stringify({ iss: API_KEY, exp: ahora + 300 }));
    const firma = b64url(createHmac("sha256", API_SECRET).update(`${header}.${payload}`).digest());
    const r = verifyLiveKitWebhook(CUERPO, `${header}.${payload}.${firma}`, API_KEY, API_SECRET);
    expect(r).toMatchObject({ ok: false, reason: "el token no trae el hash del cuerpo" });
  });

  it("rechaza un token malformado", () => {
    expect(verifyLiveKitWebhook(CUERPO, "no-es-un-jwt", API_KEY, API_SECRET).ok).toBe(false);
  });

  it("sin credenciales no valida nada", () => {
    expect(verifyLiveKitWebhook(CUERPO, firmar(CUERPO), "", API_SECRET).ok).toBe(false);
  });
});

describe("normalizeEgressInfo", () => {
  it("acepta camelCase y nombres del proto por igual", () => {
    // El servidor de LiveKit serializa protobuf a JSON y, según la versión, los
    // campos llegan de una forma o de la otra.
    const camel = normalizeEgressInfo({
      egressId: "EG_1",
      roomName: "clase-1",
      fileResults: [{ filename: "a/b.mp4", size: 100, duration: 9_000_000_000 }],
    });
    const snake = normalizeEgressInfo({
      egress_id: "EG_1",
      room_name: "clase-1",
      file_results: [{ filename: "a/b.mp4", size: "100", duration: "9000000000" }],
    });

    expect(camel).toMatchObject({ egressId: "EG_1", roomName: "clase-1" });
    expect(snake).toMatchObject({ egressId: "EG_1", roomName: "clase-1" });
    // Los enteros de 64 bits llegan como string en JSON de protobuf.
    expect(snake?.fileResults?.[0]).toEqual(camel?.fileResults?.[0]);
    expect(snake?.fileResults?.[0].size).toBe(100);
  });

  it("acepta un único `file` en vez de la lista de resultados", () => {
    const info = normalizeEgressInfo({ egressId: "EG_1", file: { filename: "x.mp4", size: 5 } });
    expect(info?.fileResults?.[0]).toMatchObject({ filename: "x.mp4", size: 5 });
  });

  it("devuelve undefined si no hay información", () => {
    expect(normalizeEgressInfo(null)).toBeUndefined();
    expect(normalizeEgressInfo("texto")).toBeUndefined();
  });
});
