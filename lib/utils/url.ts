/**
 * Normaliza una URL escrita por una persona: agrega `https://` si falta el
 * protocolo. Esto evita que un LinkedIn tipo "linkedin.com/in/foo" o
 * "www.linkedin.com/in/foo" rebote contra una validación estricta de URL.
 * Cadena vacía → "" (el llamador decide si la omite).
 */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
