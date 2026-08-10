/**
 * Credenciales del servidor LiveKit autoalojado (ADR-0031).
 *
 * Se concentran acá para que un despliegue sin configurar falle con un mensaje
 * que nombra la variable exacta —es un problema de despliegue, no algo que
 * reintentar— en vez de firmar tokens con `undefined` y que el alumno vea un
 * "no se pudo conectar" sin causa. Mismo patrón que `lib/surveys/config.ts`.
 */

export const LIVEKIT_ENV_KEYS = {
  url: "LIVEKIT_URL",
  apiKey: "LIVEKIT_API_KEY",
  apiSecret: "LIVEKIT_API_SECRET",
} as const;

export type LiveKitEnvKey = keyof typeof LIVEKIT_ENV_KEYS;

export type LiveKitConfig = {
  /** URL del servidor, en formato `wss://…`, que el cliente usa para conectarse. */
  url: string;
  apiKey: string;
  apiSecret: string;
};

/**
 * Error de configuración, no de ejecución. La ruta lo traduce a 503 nombrando
 * las variables que faltan.
 */
export class LiveKitNotConfiguredError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Faltan variables de LiveKit: ${missing.join(", ")}`);
    this.name = "LiveKitNotConfiguredError";
    this.missing = missing;
  }
}

export function getLiveKitConfig(
  env: Record<string, string | undefined> = process.env,
): LiveKitConfig {
  const missing: string[] = [];
  const read = (key: LiveKitEnvKey): string => {
    // `trim` porque una variable pegada a mano en el panel del proveedor suele
    // arrastrar un salto de línea, y un secreto con espacios firma distinto.
    const value = env[LIVEKIT_ENV_KEYS[key]]?.trim();
    if (!value) {
      missing.push(LIVEKIT_ENV_KEYS[key]);
      return "";
    }
    return value;
  };

  const config = {
    url: read("url"),
    apiKey: read("apiKey"),
    apiSecret: read("apiSecret"),
  };

  if (missing.length > 0) throw new LiveKitNotConfiguredError(missing);
  return config;
}
