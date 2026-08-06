import { describe, it, expect, afterEach } from "vitest";
import { safeNextPath, canonicalOrigin } from "../redirects";

/**
 * `safeNextPath` es la defensa contra open-redirect de toda la cadena de
 * recuperación de acceso (`/auth/confirm`, login y `set-password`), y
 * `canonicalOrigin` es lo que impide que el enlace del correo apunte al
 * permalink del deploy de Netlify, donde la cookie de sesión no aplica.
 * Ninguna de las dos tenía test.
 */

describe("safeNextPath", () => {
  it("deja pasar una ruta interna", () => {
    expect(safeNextPath("/classroom/diplomado-g4")).toBe("/classroom/diplomado-g4");
  });

  it("conserva query y fragmento de la ruta interna", () => {
    expect(safeNextPath("/classroom?tour=1#modulo-2")).toBe("/classroom?tour=1#modulo-2");
  });

  it("cae al destino por defecto cuando no viene nada", () => {
    expect(safeNextPath(null)).toBe("/classroom");
    expect(safeNextPath(undefined)).toBe("/classroom");
    // Cadena vacía: `!next` la atrapa igual que un null.
    expect(safeNextPath("")).toBe("/classroom");
  });

  it("respeta el destino por defecto que le pasen", () => {
    expect(safeNextPath(null, "/admin")).toBe("/admin");
  });

  it("rechaza una URL absoluta a otro sitio", () => {
    expect(safeNextPath("https://evil.cl/robo")).toBe("/classroom");
    expect(safeNextPath("http://evil.cl")).toBe("/classroom");
  });

  it("rechaza la protocol-relative, que es la que se escapa del startsWith('/')", () => {
    // `//evil.cl` empieza con "/" y sin el segundo chequeo pasaría el filtro:
    // el navegador la resuelve como https://evil.cl.
    expect(safeNextPath("//evil.cl/robo")).toBe("/classroom");
  });

  it("rechaza esquemas que no son http", () => {
    expect(safeNextPath("javascript:alert(1)")).toBe("/classroom");
    expect(safeNextPath("data:text/html,<script>")).toBe("/classroom");
  });

  it("rechaza una ruta relativa sin barra inicial", () => {
    expect(safeNextPath("classroom")).toBe("/classroom");
  });
});

describe("canonicalOrigin", () => {
  const original = {
    app: process.env.NEXT_PUBLIC_APP_URL,
    site: process.env.NEXT_PUBLIC_SITE_URL,
  };

  afterEach(() => {
    // Restaurar y no solo borrar: otros tests del mismo proceso leen estas dos.
    if (original.app === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original.app;
    if (original.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = original.site;
  });

  it("respeta el origen del request en local", () => {
    expect(canonicalOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(canonicalOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });

  it("ignora el permalink del deploy y usa el dominio configurado", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://capitalacademy.cl";
    // Este es el caso real que motivó la función: la cookie de sesión vive en
    // capitalacademy.cl y no aplica en el host del permalink.
    expect(canonicalOrigin("https://6a31--capitalacademy.netlify.app")).toBe(
      "https://capitalacademy.cl",
    );
  });

  it("cae a NEXT_PUBLIC_SITE_URL cuando no hay APP_URL", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://alterno.cl";
    expect(canonicalOrigin("https://cualquier.host")).toBe("https://alterno.cl");
  });

  it("cae al dominio de producción cuando no hay ninguna variable", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(canonicalOrigin("https://cualquier.host")).toBe("https://capitalacademy.cl");
  });

  it("trata la variable vacía como ausente", () => {
    // `||` y no `??`: una variable seteada en "" en Netlify no debe ganarle al
    // dominio de producción.
    process.env.NEXT_PUBLIC_APP_URL = "";
    process.env.NEXT_PUBLIC_SITE_URL = "";
    expect(canonicalOrigin("https://cualquier.host")).toBe("https://capitalacademy.cl");
  });
});
