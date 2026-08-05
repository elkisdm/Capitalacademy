import type {
  InstructorProfile,
  SocialLink,
  SocialNetwork,
} from "./types";

/**
 * Validación y presentación de las redes sociales del docente (ADR-0028).
 *
 * Estas URLs las escribe ops en el panel y terminan en el `href` de un `<a>`
 * que ve el alumno. Un `javascript:` cargado por error ahí es XSS al clic, así
 * que se valida en tres capas: CHECK en la BD (migración 0086), zod al escribir
 * y este módulo al renderizar. Esta es la última: filtra cualquier fila que
 * haya entrado antes del CHECK o por un camino que no pase por la API.
 */

const MAX_URL_LENGTH = 500;

const NETWORK_LABEL: Record<SocialNetwork, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  website: "Sitio web",
};

/**
 * `true` solo para URLs `https://` con host no vacío y de largo razonable.
 *
 * Se exige `https` explícito (no `http`) por la misma razón que el CHECK de la
 * migración: no hay motivo para enlazar sin TLS, y la lista blanca de un solo
 * protocolo es más difícil de equivocar que una lista negra de protocolos
 * peligrosos.
 */
export function isSafeProfileUrl(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return false;
  // Ni espacios ni saltos de línea: un `href` con espacios es siempre un pegado
  // roto, y permitirlos abre trucos de evasión del prefijo.
  if (/\s/.test(trimmed)) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && parsed.hostname.length > 0;
}

export type NormalizedUrl =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * Normaliza una URL escrita a mano por ops antes de guardarla.
 *
 * - Vacío o solo espacios → `null` (borrar el enlace es una operación válida).
 * - Sin protocolo (`linkedin.com/in/paola`) → se le antepone `https://`.
 * - `http://` → se RECHAZA con mensaje explícito en vez de reescribirse en
 *   silencio: cambiarle el protocolo a lo que alguien escribió es el tipo de
 *   magia que después nadie entiende.
 */
export function normalizeProfileUrl(value: unknown): NormalizedUrl {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: "El enlace debe ser texto" };
  }

  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };

  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: "El enlace es demasiado largo (máximo 500 caracteres)" };
  }
  if (/^http:\/\//i.test(trimmed)) {
    return { ok: false, error: "Usa un enlace https:// (seguro), no http://" };
  }

  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;

  if (!isSafeProfileUrl(candidate)) {
    return { ok: false, error: "El enlace no es válido. Revísalo y vuelve a intentarlo" };
  }
  return { ok: true, value: candidate };
}

/**
 * Texto corto para mostrar junto al ícono: el handle de la red cuando se puede
 * deducir, o el dominio como último recurso. Nunca la URL completa — en móvil
 * desborda la tarjeta.
 */
export function socialDisplay(network: SocialNetwork, href: string): string {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return NETWORK_LABEL[network];
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (network === "linkedin") {
    // /in/<handle>, /company/<handle> y también /in/<handle>/ con barra final.
    const handle = segments[segments.length - 1];
    return handle ? handle : host;
  }
  if (network === "instagram") {
    const handle = segments[0];
    return handle ? `@${handle}` : host;
  }
  return host;
}

/**
 * Enlaces sociales listos para renderizar, en orden fijo (LinkedIn, Instagram,
 * sitio). Descarta en silencio lo que no sea `https://`: una ficha con un
 * enlace roto se muestra sin ese enlace, no se cae.
 */
export function buildSocialLinks(
  instructor: Pick<
    InstructorProfile,
    "linkedin_url" | "instagram_url" | "website_url"
  >,
): SocialLink[] {
  const candidates: Array<[SocialNetwork, string | null]> = [
    ["linkedin", instructor.linkedin_url],
    ["instagram", instructor.instagram_url],
    ["website", instructor.website_url],
  ];

  const links: SocialLink[] = [];
  for (const [network, raw] of candidates) {
    if (!isSafeProfileUrl(raw)) continue;
    const href = (raw as string).trim();
    links.push({
      network,
      label: NETWORK_LABEL[network],
      href,
      display: socialDisplay(network, href),
    });
  }
  return links;
}

/**
 * `true` si la ficha tiene ALGO que mostrar más allá del nombre y la foto.
 * Decide entre la ficha normal y el estado vacío de la pantalla de perfil.
 */
export function hasProfileContent(
  instructor: Pick<
    InstructorProfile,
    "bio" | "headline" | "linkedin_url" | "instagram_url" | "website_url"
  >,
): boolean {
  if (instructor.bio && instructor.bio.trim()) return true;
  if (instructor.headline && instructor.headline.trim()) return true;
  return buildSocialLinks(instructor).length > 0;
}
