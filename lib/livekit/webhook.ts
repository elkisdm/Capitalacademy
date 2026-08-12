import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verificación de los webhooks del servidor LiveKit (ADR-0034).
 *
 * LiveKit no firma con un header propio: manda un JWT en `Authorization` cuyo
 * payload trae el `sha256` del cuerpo crudo. Verificar solo la firma del JWT no
 * basta —un token válido con otro cuerpo pegado seguiría pasando—, así que hay
 * que comparar también el hash del cuerpo. Por eso la ruta lee el cuerpo CRUDO
 * antes de parsearlo, igual que el webhook de Mux.
 *
 * Se verifica a mano con `node:crypto` en vez de sumar `livekit-server-sdk`:
 * mismo criterio que `lib/livekit/token.ts` y que las firmas de Mux y Svix.
 */

/** Tolerancia de reloj al validar `exp`/`nbf`, en segundos. */
const CLOCK_SKEW_SEC = 60;

export type EgressFileResult = {
  filename?: string;
  location?: string;
  size?: number;
  duration?: number;
};

export type EgressInfo = {
  egressId?: string;
  roomName?: string;
  status?: string;
  error?: string;
  startedAt?: string | number;
  endedAt?: string | number;
  fileResults?: EgressFileResult[];
};

export type LiveKitWebhookEvent = {
  event: string;
  id?: string;
  egressInfo?: EgressInfo;
};

export type LiveKitWebhookResult =
  | { ok: true; event: LiveKitWebhookEvent }
  | { ok: false; reason: string };

function base64urlToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Compara dos base64 sin que importe si vienen en base64 estándar o url-safe. */
function mismoDigest(a: string, b: string): boolean {
  const ba = base64urlToBuffer(a);
  const bb = base64urlToBuffer(b);
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Normaliza el `EgressInfo` del evento.
 *
 * El servidor de LiveKit serializa protobuf a JSON, y según la versión los
 * campos llegan en `camelCase` (`egressId`) o en los nombres del proto
 * (`egress_id`). Aceptar las dos formas cuesta una línea por campo; equivocarse
 * cuesta una grabación que nadie ingesta y ningún error en los logs.
 */
export function normalizeEgressInfo(raw: unknown): EgressInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const pick = (camel: string, snake: string): unknown => o[camel] ?? o[snake];

  const resultsRaw = pick("fileResults", "file_results");
  const file = pick("file", "file");
  const lista = Array.isArray(resultsRaw)
    ? resultsRaw
    : file && typeof file === "object"
      ? [file]
      : [];

  return {
    egressId: (pick("egressId", "egress_id") as string | undefined) ?? undefined,
    roomName: (pick("roomName", "room_name") as string | undefined) ?? undefined,
    status: (o.status as string | undefined) ?? undefined,
    error: (o.error as string | undefined) ?? undefined,
    startedAt: (pick("startedAt", "started_at") as string | number | undefined) ?? undefined,
    endedAt: (pick("endedAt", "ended_at") as string | number | undefined) ?? undefined,
    fileResults: lista.map((f) => {
      const r = (f ?? {}) as Record<string, unknown>;
      const size = r.size;
      const duration = r.duration;
      return {
        filename: (r.filename as string | undefined) ?? undefined,
        location: (r.location as string | undefined) ?? undefined,
        // Los enteros de 64 bits llegan como string en JSON de protobuf.
        size: size == null ? undefined : Number(size),
        duration: duration == null ? undefined : Number(duration),
      };
    }),
  };
}

/**
 * Verifica el JWT del webhook y devuelve el evento ya parseado.
 *
 * PURA: no lee entorno ni reloj propio (el `now` se inyecta), para que el test
 * pueda ejercitar un token vencido sin viajar en el tiempo.
 */
export function verifyLiveKitWebhook(
  rawBody: string,
  authHeader: string | null | undefined,
  apiKey: string,
  apiSecret: string,
  now: Date = new Date(),
): LiveKitWebhookResult {
  if (!apiKey || !apiSecret) return { ok: false, reason: "sin credenciales" };
  const token = authHeader?.trim().replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, reason: "falta la cabecera Authorization" };

  const partes = token.split(".");
  if (partes.length !== 3) return { ok: false, reason: "token malformado" };

  const [h, p, firma] = partes;
  const esperada = createHmac("sha256", apiSecret)
    .update(`${h}.${p}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  if (!mismoDigest(esperada, firma)) return { ok: false, reason: "firma inválida" };

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64urlToBuffer(p).toString("utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "payload ilegible" };
  }

  if (payload.iss !== apiKey) return { ok: false, reason: "emisor desconocido" };

  const ahora = Math.floor(now.getTime() / 1000);
  // `exp` es OBLIGATORIO: un token sin vencimiento sería reenviable para
  // siempre por quien capture un webhook legítimo. LiveKit siempre lo emite;
  // su ausencia es señal de un token fabricado.
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  if (exp == null) return { ok: false, reason: "el token no trae vencimiento" };
  if (ahora > exp + CLOCK_SKEW_SEC) return { ok: false, reason: "token vencido" };
  const nbf = typeof payload.nbf === "number" ? payload.nbf : null;
  if (nbf != null && ahora + CLOCK_SKEW_SEC < nbf) return { ok: false, reason: "token futuro" };

  // Sin esto, un token válido capturado de otro evento serviría para mandar
  // cualquier cuerpo: el JWT autentica al emisor, el hash ata el mensaje.
  const digest = typeof payload.sha256 === "string" ? payload.sha256 : null;
  if (!digest) return { ok: false, reason: "el token no trae el hash del cuerpo" };
  const real = createHash("sha256").update(rawBody, "utf8").digest("base64");
  if (!mismoDigest(real, digest))
    return { ok: false, reason: "el cuerpo no coincide con la firma" };

  let evento: Record<string, unknown>;
  try {
    evento = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "cuerpo ilegible" };
  }

  return {
    ok: true,
    event: {
      event: String(evento.event ?? ""),
      id: typeof evento.id === "string" ? evento.id : undefined,
      egressInfo: normalizeEgressInfo(evento.egressInfo ?? evento.egress_info),
    },
  };
}
