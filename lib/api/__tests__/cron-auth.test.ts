import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { authorizeCron } from "../cron-auth";

/**
 * Es la única puerta de los endpoints de cron: detrás está el envío de correos
 * masivos a los alumnos (`/api/cron/session-reminders`). Un fallo acá deja que
 * cualquiera dispare esos envíos, y no tenía ningún test.
 */

const SECRET = "un-secreto-de-cron-suficientemente-largo";
const original = process.env.CRON_SECRET;

function req(authorization?: string): Request {
  return new Request("http://localhost/api/cron/lo-que-sea", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("authorizeCron", () => {
  it("acepta el Bearer con el secreto correcto", () => {
    expect(authorizeCron(req(`Bearer ${SECRET}`))).toBe(true);
  });

  it("rechaza un secreto equivocado del mismo largo", () => {
    // Mismo largo a propósito: es el caso que la comparación timing-safe tiene
    // que resolver por contenido y no por longitud.
    const falso = "x".repeat(SECRET.length);
    expect(falso).toHaveLength(SECRET.length);
    expect(authorizeCron(req(`Bearer ${falso}`))).toBe(false);
  });

  it("rechaza un secreto de otro largo sin reventar", () => {
    // `timingSafeEqual` LANZA si los buffers difieren en tamaño: por eso el
    // chequeo de longitud va antes. Sin él, esto sería un 500 en vez de un 401.
    expect(authorizeCron(req("Bearer corto"))).toBe(false);
    expect(authorizeCron(req(`Bearer ${SECRET}-de-mas`))).toBe(false);
  });

  it("rechaza cuando no viene el header", () => {
    expect(authorizeCron(req())).toBe(false);
  });

  it("rechaza otros esquemas de autorización", () => {
    expect(authorizeCron(req(SECRET))).toBe(false);
    expect(authorizeCron(req(`Basic ${SECRET}`))).toBe(false);
    // Sensible a mayúsculas a propósito: el header lo emite nuestro propio cron.
    expect(authorizeCron(req(`bearer ${SECRET}`))).toBe(false);
  });

  it("rechaza un Bearer vacío", () => {
    expect(authorizeCron(req("Bearer "))).toBe(false);
  });

  it("deniega si no hay secreto configurado, en vez de dejar pasar a todos", () => {
    // Un despliegue sin CRON_SECRET debe quedar cerrado, no abierto.
    delete process.env.CRON_SECRET;
    expect(authorizeCron(req("Bearer lo-que-sea"))).toBe(false);
    expect(authorizeCron(req("Bearer "))).toBe(false);
  });

  it("no confunde el secreto con una cadena que lo contiene", () => {
    expect(authorizeCron(req(`Bearer ${SECRET}x`))).toBe(false);
    expect(authorizeCron(req(`Bearer x${SECRET}`))).toBe(false);
  });
});
