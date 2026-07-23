/**
 * Saneamiento del parámetro `next` (destino post-autenticación).
 *
 * Solo se aceptan rutas internas: `/algo`. Se rechazan absolutas (`https://…`)
 * y protocol-relative (`//host`) para evitar open-redirects. Se comparte entre
 * `/auth/confirm`, el login y `set-password` porque los tres arrastran el mismo
 * destino a lo largo de la cadena de recuperación de acceso.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/classroom",
): string {
  if (!next) return fallback;
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/**
 * Origen canónico para redirects post-autenticación y para los enlaces que se
 * mandan por correo.
 *
 * En Netlify, el host del request puede ser el permalink del deploy
 * (`6a31…--capitalacademy.netlify.app`) en vez del dominio real. Si el enlace
 * de confirmación apunta ahí, la cookie de sesión (seteada en
 * capitalacademy.cl) no aplica en ese host → la persona rebota al login aunque
 * la confirmación haya funcionado. Solo se respeta el origen del request en
 * desarrollo local.
 */
export function canonicalOrigin(requestOrigin: string): string {
  if (
    requestOrigin.includes("localhost") ||
    requestOrigin.includes("127.0.0.1")
  ) {
    return requestOrigin;
  }
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://capitalacademy.cl"
  );
}
