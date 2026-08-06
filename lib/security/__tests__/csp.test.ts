import { describe, it, expect } from "vitest";
import { buildCsp, livekitConnectSources, PERMISSIONS_POLICY } from "../csp";

/**
 * Estos tests existen por un fallo real: la sala en vivo no conectaba porque
 * `connect-src` no incluía el host de LiveKit. El síntoma era un error genérico
 * en la pantalla del alumno, con el servidor devolviendo 200: nada en el build
 * ni en la suite lo delataba.
 */

const LK = "wss://livekit-production-0c7a.up.railway.app";

function directive(csp: string, name: string): string {
  const d = csp.split("; ").find((x) => x.startsWith(`${name} `));
  if (!d) throw new Error(`falta la directiva ${name}`);
  return d;
}

describe("livekitConnectSources", () => {
  it("permite el WebSocket y el HTTP del mismo host", () => {
    // El SDK abre la señalización por wss y además pega al host por https.
    expect(livekitConnectSources(LK)).toEqual([
      "wss://livekit-production-0c7a.up.railway.app",
      "https://livekit-production-0c7a.up.railway.app",
    ]);
  });

  it("no agrega nada si LiveKit no está configurado", () => {
    expect(livekitConnectSources(undefined)).toEqual([]);
    expect(livekitConnectSources("")).toEqual([]);
    expect(livekitConnectSources("   ")).toEqual([]);
  });

  it("una URL inválida no tumba el build", () => {
    expect(livekitConnectSources("no-es-una-url")).toEqual([]);
  });

  it("conserva el puerto cuando lo hay", () => {
    expect(livekitConnectSources("ws://localhost:7880")).toEqual([
      "wss://localhost:7880",
      "https://localhost:7880",
    ]);
  });
});

describe("buildCsp", () => {
  it("incluye el host de LiveKit en connect-src", () => {
    const connect = directive(buildCsp({ isDev: false, livekitUrl: LK }), "connect-src");
    expect(connect).toContain("wss://livekit-production-0c7a.up.railway.app");
  });

  it("sin LiveKit, connect-src no cambia respecto de lo que ya había", () => {
    const connect = directive(buildCsp({ isDev: false }), "connect-src");
    expect(connect).toBe(
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co " +
        "https://api.fintoc.com https://*.fintoc.com https://*.mux.com https://*.fastly.mux.com",
    );
  });

  it("no pierde los orígenes que ya funcionaban", () => {
    // Supabase y Mux estaban antes: agregar LiveKit no puede desplazarlos.
    const connect = directive(buildCsp({ isDev: false, livekitUrl: LK }), "connect-src");
    for (const origen of [
      "'self'",
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://*.mux.com",
      "https://api.fintoc.com",
    ]) {
      expect(connect).toContain(origen);
    }
  });

  it("solo permite unsafe-eval en desarrollo", () => {
    expect(directive(buildCsp({ isDev: true }), "script-src")).toContain("'unsafe-eval'");
    expect(directive(buildCsp({ isDev: false }), "script-src")).not.toContain("'unsafe-eval'");
  });

  it("mantiene las directivas que acotan la superficie", () => {
    const csp = buildCsp({ isDev: false, livekitUrl: LK });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
});

describe("PERMISSIONS_POLICY", () => {
  it("habilita cámara y micrófono SOLO para el propio origen", () => {
    // Sin esto la sala en vivo no puede pedir dispositivos, aunque el CSP esté
    // bien: son dos frenos distintos.
    expect(PERMISSIONS_POLICY).toContain("camera=(self)");
    expect(PERMISSIONS_POLICY).toContain("microphone=(self)");
    // `*` dejaría que un iframe de terceros los pida en nombre del sitio.
    expect(PERMISSIONS_POLICY).not.toContain("*");
  });

  it("deja la geolocalización prohibida, que nada la usa", () => {
    expect(PERMISSIONS_POLICY).toContain("geolocation=()");
  });
});
