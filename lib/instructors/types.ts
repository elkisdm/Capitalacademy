/**
 * Ficha docente del catálogo `public.instructors`.
 *
 * Las cuatro columnas del perfil público (`headline` + las tres redes) se
 * agregan en `db/migrations/0086_instructors_perfil_publico.sql`. Hasta que se
 * regeneren los tipos del CLI de Supabase (`supabase gen types`) NO están en
 * `Tables<"instructors">`, por eso este tipo se declara a mano — el mismo
 * patrón que ya usa `ClassSession` en `lib/classroom/types.ts` para
 * `teacher_id` y `title`.
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
