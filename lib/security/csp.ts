/**
 * Cabeceras de seguridad de la aplicación.
 *
 * Vive en `lib/` y no dentro de `next.config.ts` para poder testearlo: esta
 * configuración ya falló dos veces en silencio (la subida a Mux, y la sala en
 * vivo de ADR-0031), y las dos veces el síntoma fue el mismo —el navegador
 * bloquea la conexión y la app muestra un error genérico sin causa—. Un CSP
 * incompleto no rompe el build ni ningún test: solo rompe la función en
 * producción.
 */

/**
 * Convierte la URL del servidor de LiveKit en los orígenes que hay que
 * permitir. Devuelve lista vacía si no está configurada, para que un despliegue
 * sin LiveKit no meta basura en la cabecera.
 *
 * Se agregan los DOS esquemas a propósito: el SDK abre el WebSocket de
 * señalización (`wss://`) y además hace peticiones HTTP al mismo host (validar
 * el token, resolver región).
 */
export function livekitConnectSources(livekitUrl: string | undefined): string[] {
  const raw = livekitUrl?.trim();
  if (!raw) return [];

  let host: string;
  let seguro: boolean;
  try {
    const u = new URL(raw);
    host = u.host;
    // El esquema se respeta en vez de asumir TLS: un LiveKit local es
    // `ws://localhost:7880`, y anunciar `wss://localhost` deja al navegador
    // bloqueando la conexión con un error de CSP que no dice qué falta. En
    // producción la URL es `wss://`, así que ahí no cambia nada.
    seguro = u.protocol !== "ws:" && u.protocol !== "http:";
  } catch {
    // Una URL mal escrita no debe tumbar el build: se ignora y LiveKit
    // simplemente no funcionará, igual que si faltara la variable.
    return [];
  }
  if (!host) return [];

  return seguro ? [`wss://${host}`, `https://${host}`] : [`ws://${host}`, `http://${host}`];
}

/**
 * Analítica propia (Umami). El `<script>` está fijo en `app/layout.tsx` y hay
 * que permitirlo en DOS directivas: `script-src` para poder cargarlo y
 * `connect-src` para que pueda mandar los eventos.
 *
 * OJO: estuvo bloqueado desde que existe este CSP —el host nunca figuró en
 * `script-src`—, así que la analítica no estaba midiendo nada. No dio ningún
 * error visible: exactamente el mismo silencio que tapó lo de LiveKit.
 */
const UMAMI_ORIGIN = "https://umami-production-41e5.up.railway.app";

/**
 * Meta Pixel de la landing /liderazgo (ver components/analytics/meta-pixel.tsx).
 * El script se carga desde `connect.facebook.net` y el propio `fbq()` manda
 * los eventos a `www.facebook.com` — sin las dos directivas el pixel corre
 * en silencio: no da error, pero tampoco mide nada, igual que le pasó a
 * Umami antes de que se agregara a esta cabecera.
 */
const META_PIXEL_SCRIPT_ORIGIN = "https://connect.facebook.net";
const META_PIXEL_CONNECT_ORIGIN = "https://www.facebook.com";

export function buildCsp(opts: {
  isDev: boolean;
  livekitUrl?: string;
}): string {
  const { isDev, livekitUrl } = opts;

  const connect = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://api.fintoc.com",
    "https://*.fintoc.com",
    "https://*.mux.com",
    "https://*.fastly.mux.com",
    UMAMI_ORIGIN,
    META_PIXEL_CONNECT_ORIGIN,
    ...livekitConnectSources(livekitUrl),
  ];

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.fintoc.com ${UMAMI_ORIGIN} ${META_PIXEL_SCRIPT_ORIGIN}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${connect.join(" ")}`,
    "media-src 'self' https://stream.mux.com https://*.fastly.mux.com blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' https://*.fintoc.com https://view.officeapps.live.com",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * Permissions-Policy del sitio.
 *
 * Cámara, micrófono y captura de pantalla pasan de estar prohibidos a
 * permitidos SOLO para nuestro propio origen (`self`), que es lo que necesita
 * la sala en vivo —incluido compartir pantalla—. `self` no es una relajación
 * cosmética: sigue bloqueando que un iframe de terceros —el checkout de Fintoc,
 * el visor de Office— los pida en nombre del sitio.
 *
 * `display-capture` ya venía permitido por defecto en los navegadores, pero se
 * declara explícito: la cabecera es el lugar donde se lee qué puede hacer el
 * sitio, y un permiso que la clase necesita no debería depender de un default
 * que puede cambiar.
 *
 * La geolocalización sigue prohibida para todos: nada la usa.
 */
export const PERMISSIONS_POLICY =
  "camera=(self), microphone=(self), display-capture=(self), geolocation=()";
