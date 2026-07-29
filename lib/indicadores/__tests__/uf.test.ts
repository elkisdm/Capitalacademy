import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { __fetchValorUF, rechazarFallback } from "@/lib/indicadores/uf";
import { VALOR_UF_FALLBACK } from "@/lib/credito/constants";

const ok = (json: unknown) =>
  ({ ok: true, json: async () => json }) as unknown as Response;

describe("fetchValorUF", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("toma el primer valor de la serie de mindicador", async () => {
    vi.mocked(fetch).mockResolvedValue(
      ok({
        codigo: "uf",
        serie: [
          { fecha: "2026-07-29T04:00:00.000Z", valor: 41_234.56 },
          { fecha: "2026-07-28T04:00:00.000Z", valor: 41_200 },
        ],
      }),
    );

    const r = await __fetchValorUF();
    expect(r).toEqual({
      valor: 41_234.56,
      fecha: "2026-07-29",
      esFallback: false,
    });
  });

  it("cae al valor de respaldo si la API responde con error HTTP", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);

    const r = await __fetchValorUF();
    expect(r).toEqual({ valor: VALOR_UF_FALLBACK, fecha: null, esFallback: true });
  });

  it("cae al valor de respaldo si la red falla o expira el timeout", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("TimeoutError"));

    const r = await __fetchValorUF();
    expect(r.esFallback).toBe(true);
    expect(r.valor).toBe(VALOR_UF_FALLBACK);
  });

  it("cae al valor de respaldo si el JSON no trae serie usable", async () => {
    for (const payload of [{}, { serie: [] }, { serie: "no-es-arreglo" }, null]) {
      vi.mocked(fetch).mockResolvedValue(ok(payload));
      const r = await __fetchValorUF();
      expect(r.esFallback).toBe(true);
    }
  });

  it("cae al valor de respaldo si el valor no es un número positivo", async () => {
    for (const valor of ["", null, 0, -1, "abc", undefined]) {
      vi.mocked(fetch).mockResolvedValue(ok({ serie: [{ valor, fecha: "x" }] }));
      const r = await __fetchValorUF();
      expect(r.esFallback).toBe(true);
    }
  });

  it("acepta un valor válido aunque la fecha venga malformada", async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ serie: [{ valor: 41_000, fecha: 123 }] }));

    const r = await __fetchValorUF();
    expect(r.valor).toBe(41_000);
    expect(r.fecha).toBeNull();
    expect(r.esFallback).toBe(false);
  });

  it("cae al valor de respaldo si el cuerpo no es JSON", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);

    const r = await __fetchValorUF();
    expect(r.esFallback).toBe(true);
  });
});

describe("rechazarFallback", () => {
  // Esta es la pieza que impide que una falla transitoria de mindicador quede
  // cacheada 12 horas: `unstable_cache` no guarda promesas rechazadas.
  // (`getValorUF` en sí no se testea acá porque `unstable_cache` requiere el
  // runtime de Next; su comportamiento se verificó en el navegador.)

  it("deja pasar un valor real sin tocarlo", () => {
    const real = { valor: 40_844.79, fecha: "2026-07-29", esFallback: false };
    expect(rechazarFallback(real)).toBe(real);
  });

  it("lanza cuando el valor es de respaldo, para que no se cachee", () => {
    expect(() =>
      rechazarFallback({ valor: VALOR_UF_FALLBACK, fecha: null, esFallback: true }),
    ).toThrow("uf-no-disponible");
  });
});
