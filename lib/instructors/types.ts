/**
 * Ficha docente del catálogo `public.instructors`.
 *
 * Es la PROYECCIÓN que devuelven las consultas de perfil, no la fila completa:
 * se declara a mano para que calce exactamente con `INSTRUCTOR_PROFILE_COLUMNS`
 * y deje fuera lo que el perfil público no debe arrastrar (`email`,
 * `is_active`, `profile_id`). Las columnas en sí ya existen en
 * `Tables<"instructors">` desde que se regeneraron los tipos.
 */
export type InstructorProfile = {
  id: string;
  full_name: string;
  photo_url: string | null;
  bio: string | null;
  headline: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  website_url: string | null;
};

/** Columnas que pide cualquier query de perfil. Una sola fuente de verdad. */
export const INSTRUCTOR_PROFILE_COLUMNS =
  "id, full_name, photo_url, bio, headline, linkedin_url, instagram_url, website_url";

export type SocialNetwork = "linkedin" | "instagram" | "website";

export type SocialLink = {
  network: SocialNetwork;
  /** Nombre de la red, para el `aria-label` y el tooltip. */
  label: string;
  /** URL segura (siempre `https://`), lista para el `href`. */
  href: string;
  /** Texto corto y legible: "@usuario", "paolavicuna", "sitio.cl". */
  display: string;
};
