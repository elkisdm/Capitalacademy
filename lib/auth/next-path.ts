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
