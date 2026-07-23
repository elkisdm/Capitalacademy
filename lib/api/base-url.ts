/**
 * URL pública base del sitio, sin barra final. Para usos SIN objeto Request
 * (emails, webhooks, jobs en background). Resuelve desde env — cambia por
 * entorno de deploy (dev/preview/prod). Ignora localhost para no emitir enlaces
 * locales en correos que se abren en otro dispositivo.
 */
export function getPublicBaseUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv && !fromEnv.startsWith("http://localhost")) return fromEnv;
  return "https://capitalacademy.cl";
}
