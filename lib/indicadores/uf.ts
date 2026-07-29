/**
 * Valor de la UF del día, desde mindicador.cl (API pública del Banco Central,
 * sin credenciales).
 *
 * Se cachea 12 horas: la UF cambia una vez al día, así que consultarla en cada
 * request de la calculadora sería regalarle latencia al usuario y tráfico a un
 * servicio ajeno.
 */

import { unstable_cache } from "next/cache";
import { VALOR_UF_FALLBACK } from "@/lib/credito/constants";

const ENDPOINT = "https://mindicador.cl/api/uf";

/**
 * 12s, deliberadamente generoso: medido desde Node, mindicador responde entre
 * 1,1s y 10,7s (muy variable, aunque `curl` sea instantáneo). Un timeout corto
 * hacía caer el fallback casi siempre. Esperar sale casi gratis porque este
 * fetch ocurre al revalidar la caché de 12h, no en el request del visitante.
 */
const TIMEOUT_MS = 12_000;

export type ValorUF = {
  valor: number;
  /** Fecha del valor en formato YYYY-MM-DD, o null si vino del fallback. */
  fecha: string | null;
  /** true cuando la API no respondió y se usó `VALOR_UF_FALLBACK`. */
  esFallback: boolean;
};

const FALLBACK: ValorUF = {
  valor: VALOR_UF_FALLBACK,
  fecha: null,
  esFallback: true,
};

async function fetchValorUF(): Promise<ValorUF> {
  try {
    const res = await fetch(ENDPOINT, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      console.error("[uf] mindicador respondió", res.status);
      return FALLBACK;
    }

    const json: unknown = await res.json();
    const serie = (json as { serie?: unknown })?.serie;
    if (!Array.isArray(serie) || serie.length === 0) return FALLBACK;

    const ultimo = serie[0] as { valor?: unknown; fecha?: unknown };
    const valor = Number(ultimo?.valor);
    if (!Number.isFinite(valor) || valor <= 0) return FALLBACK;

    const fecha =
      typeof ultimo?.fecha === "string" ? ultimo.fecha.slice(0, 10) : null;

    return { valor, fecha, esFallback: false };
  } catch (err) {
    // Timeout, red caída o JSON inválido: la calculadora sigue funcionando
    // con el último valor conocido y la UI lo advierte. Nunca silencioso:
    // sin Sentry en el proyecto, el log del servidor es la única señal.
    console.error("[uf] no se pudo obtener el valor de mindicador.cl:", err);
    return FALLBACK;
  }
}

/**
 * Deja pasar el valor real y LANZA si vino del fallback.
 *
 * Es la pieza que evita el peor escenario: `unstable_cache` no guarda promesas
 * rechazadas, así que una falla transitoria de mindicador no queda congelada 12
 * horas — el siguiente render reintenta. Cachear el fallback sería peor que no
 * cachear nada.
 */
export function rechazarFallback(resultado: ValorUF): ValorUF {
  if (resultado.esFallback) throw new Error("uf-no-disponible");
  return resultado;
}

const getValorUFCacheado = unstable_cache(
  async (): Promise<ValorUF> => rechazarFallback(await fetchValorUF()),
  ["indicador-uf"],
  { revalidate: 43_200 },
);

/** Cacheado 12h. Nunca lanza: ante cualquier falla devuelve el valor de respaldo. */
export async function getValorUF(): Promise<ValorUF> {
  try {
    return await getValorUFCacheado();
  } catch {
    // Ya se logueó la causa dentro de `fetchValorUF`.
    return FALLBACK;
  }
}

/** Export para tests: la función sin la capa de caché de Next. */
export { fetchValorUF as __fetchValorUF };
