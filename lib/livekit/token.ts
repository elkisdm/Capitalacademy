import { createHmac } from "node:crypto";

/**
 * Firma de tokens de acceso a LiveKit (ADR-0031).
 *
 * Un token de LiveKit es un JWT HS256 corriente: el servidor no consulta
 * ninguna base para autorizar, confía en lo que dice este papelito firmado con
 * el secreto compartido. Por eso todo lo que va adentro tiene que decidirse en
 * el servidor —nunca copiarse de lo que mande el cliente— y por eso los grants
 * se arman en `lib/livekit/access.ts` y acá solo se firman.
 *
 * Se firma a mano con `node:crypto` en vez de sumar `livekit-server-sdk`: es el
 * mismo criterio con que el repo ya verifica a mano las firmas de Mux y de Svix
 * (`app/api/webhooks/resend/route.ts`), y evita traer un SDK entero para 30
 * líneas de HMAC.
 */

export type VideoGrant = {
  /** Sala a la que da acceso. Es lo único que acota el token: sin esto, sirve para cualquiera. */
  room: string;
  roomJoin: true;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  /** Moderación (silenciar, expulsar). Solo para quien dicta la clase. */
  roomAdmin?: boolean;
  /**
   * Crear y BORRAR salas.
   *
   * `DeleteRoom` —lo que hay detrás de "Terminar la clase para todos"— es la
   * única llamada de moderación que LiveKit no cubre con `roomAdmin`.
   *
   * OJO: este permiso es GLOBAL del servidor. A diferencia de `roomJoin` y
   * `roomAdmin`, LiveKit NO acota `roomCreate` al campo `room` del grant: un
   * token que lo lleve puede borrar CUALQUIER sala mientras viva. Por eso
   * nunca va en el token de un participante ni cruza al navegador: solo en el
   * token de servicio de 60 s que se firma y consume dentro del mismo handler.
   */
  roomCreate?: boolean;
  /**
   * Permite pedirle a Egress que grabe (ADR-0034).
   *
   * GLOBAL igual que `roomCreate`: LiveKit no lo acota por sala. Un token con
   * este permiso puede arrancar egress —facturables— sobre cualquier sala del
   * servidor. Solo en el token de servicio de 60 s de `StartRoomCompositeEgress`,
   * nunca en el de un participante ni de vuelta al cliente.
   */
  roomRecord?: boolean;
};

export type AccessTokenInput = {
  apiKey: string;
  apiSecret: string;
  /** Identidad estable del participante. Usamos el id del perfil. */
  identity: string;
  /** Nombre visible en la sala. */
  name?: string;
  grant: VideoGrant;
  /** Momento de emisión, inyectable para que los tests no dependan del reloj. */
  issuedAt: Date;
  expiresAt: Date;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Devuelve el JWT firmado. Pura: mismas entradas, misma salida, sin reloj ni
 * red — que es justo lo que permite testear la autorización de verdad.
 */
export function createAccessToken(input: AccessTokenInput): string {
  const { apiKey, apiSecret, identity, name, grant, issuedAt, expiresAt } = input;

  if (!apiKey || !apiSecret) {
    throw new Error("createAccessToken: falta apiKey o apiSecret");
  }
  if (!identity) {
    throw new Error("createAccessToken: falta identity");
  }
  if (!grant.room) {
    throw new Error("createAccessToken: el grant debe acotar una sala");
  }

  const iat = Math.floor(issuedAt.getTime() / 1000);
  const exp = Math.floor(expiresAt.getTime() / 1000);
  if (exp <= iat) {
    throw new Error("createAccessToken: el token vencería antes de emitirse");
  }

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: apiKey,
    sub: identity,
    // `nbf` un poco antes de la emisión: si el reloj del servidor de LiveKit va
    // unos segundos atrás, un token recién firmado sería rechazado por futuro.
    nbf: iat - 30,
    iat,
    exp,
    ...(name ? { name } : {}),
    video: grant,
  };

  const signingInput =
    `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(
    createHmac("sha256", apiSecret).update(signingInput).digest(),
  );

  return `${signingInput}.${signature}`;
}
