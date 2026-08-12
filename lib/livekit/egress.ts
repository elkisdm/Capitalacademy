import { createAccessToken } from "./token";
import { normalizeEgressInfo, type EgressInfo } from "./webhook";
import type { LiveKitConfig } from "./config";

/**
 * Cliente de LiveKit Egress (ADR-0034).
 *
 * Único lugar del repo con I/O hacia Egress. Se habla twirp con `fetch`, igual
 * que `app/api/classroom/clase/[sessionId]/moderar/route.ts`: los endpoints
 * aceptan JSON en snake_case y ese camino ya está probado en producción. No se
 * suma `livekit-server-sdk` por tres llamadas; el token se firma con el mismo
 * `createAccessToken()` que emite los de la sala.
 */

/** Bucket privado donde Egress deja el MP4 antes de que se ingeste a Mux. */
export const GRABACIONES_BUCKET = "grabaciones";

export const EGRESS_ENV_KEYS = {
  accessKeyId: "SUPABASE_S3_ACCESS_KEY_ID",
  secretAccessKey: "SUPABASE_S3_SECRET_ACCESS_KEY",
  region: "SUPABASE_S3_REGION",
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
} as const;

export type EgressStorageConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /** Endpoint S3 de Supabase Storage. */
  endpoint: string;
  bucket: string;
};

/** Error de configuración, no de ejecución: la ruta lo traduce a 503. */
export class EgressNotConfiguredError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Falta configuración de grabación: ${missing.join(", ")}`);
    this.name = "EgressNotConfiguredError";
    this.missing = missing;
  }
}

/** Egress rechazó la llamada (sin CPU, servicio caído, sala inexistente). */
export class EgressRequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "EgressRequestError";
    this.status = status;
    this.code = code;
  }

  /**
   * ¿El fallo es "esa sala no existe"? Es el caso normal de pedir grabar antes
   * de que alguien se conecte, y merece un 409 con instrucción, no un 502.
   */
  get salaInexistente(): boolean {
    return this.code === "not_found" || /room.*(not found|does not exist)/i.test(this.message);
  }
}

/**
 * Interruptor de despliegue (`LIVEKIT_EGRESS_ENABLED`).
 *
 * Apagado, la sala funciona exactamente como hoy y no se graba nada. Es lo que
 * permite cortar la grabación sin desplegar código.
 */
export function isEgressEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.LIVEKIT_EGRESS_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

export function getEgressStorageConfig(
  env: Record<string, string | undefined> = process.env,
): EgressStorageConfig {
  const missing: string[] = [];
  const leer = (key: keyof typeof EGRESS_ENV_KEYS): string => {
    const value = env[EGRESS_ENV_KEYS[key]]?.trim();
    if (!value) {
      missing.push(EGRESS_ENV_KEYS[key]);
      return "";
    }
    return value;
  };

  const accessKeyId = leer("accessKeyId");
  const secretAccessKey = leer("secretAccessKey");
  const region = leer("region");
  // El endpoint se DERIVA de la URL del proyecto en vez de ser su propia
  // variable: dos variables que apuntan al mismo proyecto son dos variables que
  // pueden apuntar a proyectos distintos, y el síntoma sería un archivo subido
  // a un Supabase donde nadie lo busca.
  const supabaseUrl = leer("supabaseUrl").replace(/\/+$/, "");

  if (missing.length > 0) throw new EgressNotConfiguredError(missing);

  return {
    accessKeyId,
    secretAccessKey,
    region,
    endpoint: `${supabaseUrl}/storage/v1/s3`,
    bucket: GRABACIONES_BUCKET,
  };
}

/** Token de servicio acotado a UNA sala y con vida de 60 s. */
function tokenDeServicio(config: LiveKitConfig, room: string, now: Date): string {
  return createAccessToken({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    identity: `grabacion-${room}`,
    grant: {
      room,
      roomJoin: true,
      canPublish: false,
      canSubscribe: false,
      canPublishData: false,
      // El único permiso que necesita. Es GLOBAL (LiveKit no lo acota por
      // sala): sirve para grabar cualquier sala mientras vive, por eso el
      // token dura 60 s y nunca sale de este módulo.
      roomRecord: true,
    },
    issuedAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
  });
}

async function llamarEgress(
  config: LiveKitConfig,
  room: string,
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const httpBase = config.url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  const token = tokenDeServicio(config, room, new Date());

  let res: Response;
  try {
    res = await fetch(`${httpBase}/twirp/livekit.Egress/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // Egress caído o red cortada: se convierte en un error tipado para que la
    // ruta responda 502 y deje la fila en `failed` con el motivo. La clase
    // nunca se cae por esto.
    throw new EgressRequestError(
      e instanceof Error ? e.message : "no se pudo contactar a LiveKit",
      0,
      null,
    );
  }

  const texto = await res.text().catch(() => "");
  if (!res.ok) {
    let code: string | null = null;
    let msg = texto.slice(0, 300);
    try {
      const err = JSON.parse(texto) as { code?: string; msg?: string };
      code = err.code ?? null;
      msg = err.msg ?? msg;
    } catch {
      // Respuesta que no es el JSON de twirp: sirve el texto crudo recortado.
    }
    throw new EgressRequestError(msg || `Egress respondió ${res.status}`, res.status, code);
  }

  try {
    return JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export type StartRoomCompositeInput = {
  config: LiveKitConfig;
  storage: EgressStorageConfig;
  /** Nombre de la sala en LiveKit (`clase-<uuid>`). */
  room: string;
  /** Ruta del objeto dentro del bucket (ver `filePathFor`). */
  filepath: string;
};

/**
 * Arranca la grabación compuesta de una sala hacia el bucket privado.
 *
 * `layout: "speaker"` y no `grid`: una grilla de 20 cámaras a 720p es la peor
 * relación entre bitrate y utilidad para una repetición donde lo que importa es
 * quien habla y lo que comparte en pantalla.
 */
export async function startRoomComposite(input: StartRoomCompositeInput): Promise<EgressInfo> {
  const { config, storage, room, filepath } = input;
  const data = await llamarEgress(config, room, "StartRoomCompositeEgress", {
    room_name: room,
    layout: "speaker",
    audio_only: false,
    file_outputs: [
      {
        file_type: "MP4",
        filepath,
        s3: {
          access_key: storage.accessKeyId,
          secret: storage.secretAccessKey,
          region: storage.region,
          endpoint: storage.endpoint,
          bucket: storage.bucket,
          // Supabase Storage no sirve buckets como subdominio.
          force_path_style: true,
        },
      },
    ],
  });
  return normalizeEgressInfo(data) ?? {};
}

export async function stopEgress(input: {
  config: LiveKitConfig;
  room: string;
  egressId: string;
}): Promise<EgressInfo> {
  const data = await llamarEgress(input.config, input.room, "StopEgress", {
    egress_id: input.egressId,
  });
  return normalizeEgressInfo(data) ?? {};
}

/** Trabajos de esa sala. `activos: true` limita a los que siguen corriendo. */
export async function listEgress(input: {
  config: LiveKitConfig;
  room: string;
  activos?: boolean;
}): Promise<EgressInfo[]> {
  const data = await llamarEgress(input.config, input.room, "ListEgress", {
    room_name: input.room,
    active: input.activos ?? false,
  });
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((i) => normalizeEgressInfo(i) ?? {});
}
