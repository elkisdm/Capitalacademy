import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { createAccessToken, type VideoGrant } from "../token";

/**
 * El token ES la autorización: el servidor de LiveKit no consulta nada más. Un
 * error acá no da un 500 visible, da acceso indebido en silencio.
 */

const KEY = "APItestkey";
const SECRET = "un-secreto-de-prueba-suficientemente-largo";

function decode(token: string) {
  const [h, p, s] = token.split(".");
  const json = (part: string) =>
    JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  return { header: json(h), payload: json(p), signature: s, signingInput: `${h}.${p}` };
}

const grant: VideoGrant = {
  room: "clase-abc",
  roomJoin: true,
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
};

function build(overrides: Partial<Parameters<typeof createAccessToken>[0]> = {}) {
  return createAccessToken({
    apiKey: KEY,
    apiSecret: SECRET,
    identity: "user-1",
    name: "Ana Pérez",
    grant,
    issuedAt: new Date("2026-08-06T12:00:00Z"),
    expiresAt: new Date("2026-08-06T14:00:00Z"),
    ...overrides,
  });
}

describe("createAccessToken", () => {
  it("arma un JWT HS256 de tres partes", () => {
    const { header } = decode(build());
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(build().split(".")).toHaveLength(3);
  });

  it("firma con el secreto, verificable de forma independiente", () => {
    const token = build();
    const { signingInput, signature } = decode(token);
    const esperada = createHmac("sha256", SECRET)
      .update(signingInput)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(signature).toBe(esperada);
  });

  it("cambia la firma si cambia el secreto", () => {
    expect(build()).not.toBe(build({ apiSecret: "otro-secreto-distinto" }));
  });

  it("pone la api key como emisor y la identidad como sujeto", () => {
    const { payload } = decode(build());
    expect(payload.iss).toBe(KEY);
    expect(payload.sub).toBe("user-1");
    expect(payload.name).toBe("Ana Pérez");
  });

  it("lleva el grant tal cual, con la sala acotada", () => {
    const { payload } = decode(build());
    expect(payload.video).toEqual(grant);
    expect(payload.video.room).toBe("clase-abc");
  });

  it("usa las fechas que le pasan, no el reloj", () => {
    const { payload } = decode(build());
    expect(payload.iat).toBe(Math.floor(Date.parse("2026-08-06T12:00:00Z") / 1000));
    expect(payload.exp).toBe(Math.floor(Date.parse("2026-08-06T14:00:00Z") / 1000));
  });

  it("adelanta el nbf medio minuto por si el reloj del servidor va atrasado", () => {
    const { payload } = decode(build());
    expect(payload.iat - payload.nbf).toBe(30);
  });

  it("omite el nombre cuando no se pasa, en vez de mandar vacío", () => {
    const { payload } = decode(build({ name: undefined }));
    expect(payload).not.toHaveProperty("name");
  });

  it("es determinista: mismas entradas, mismo token", () => {
    expect(build()).toBe(build());
  });

  it("no emite un token sin sala: serviría para cualquiera", () => {
    expect(() => build({ grant: { ...grant, room: "" } })).toThrow(/sala/i);
  });

  it("no emite sin credenciales", () => {
    expect(() => build({ apiKey: "" })).toThrow(/apiKey|apiSecret/);
    expect(() => build({ apiSecret: "" })).toThrow(/apiKey|apiSecret/);
  });

  it("no emite sin identidad", () => {
    expect(() => build({ identity: "" })).toThrow(/identity/);
  });

  it("no emite un token ya vencido", () => {
    expect(() =>
      build({
        issuedAt: new Date("2026-08-06T14:00:00Z"),
        expiresAt: new Date("2026-08-06T12:00:00Z"),
      }),
    ).toThrow(/vencer/i);
  });

  it("el base64url no arrastra relleno ni caracteres que rompan la URL", () => {
    const token = build({ identity: "un-id-largo-para-forzar-relleno-en-base64-????" });
    expect(token).not.toMatch(/[+/=]/);
  });
});
