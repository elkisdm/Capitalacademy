import { z } from "zod";
import { normalizeProfileUrl } from "./social";

/**
 * Validación compartida del perfil público del docente (ADR-0028).
 *
 * La usan DOS rutas con autorizaciones distintas pero el mismo contrato de
 * datos: el panel de operaciones (`/api/admin/instructors/[id]`, que edita la
 * ficha de cualquiera) y el autoservicio del docente (`/api/docente/perfil`,
 * que edita solo la propia). Vive en `lib/` para tener una sola definición de
 * qué campos son editables y cómo se normalizan — y para poder testearla, que
 * es donde este proyecto mide cobertura.
 *
 * `full_name`, `email`, `photo_url`, `is_active` y `profile_id` NO son
 * editables por acá: son identidad de la ficha, no contenido de su perfil.
 */
const URL_FIELDS = ["linkedin_url", "instagram_url", "website_url"] as const;

export const BIO_MAX = 4000;
export const HEADLINE_MAX = 120;

export type InstructorPatchKey =
  | "headline"
  | "bio"
  | "linkedin_url"
  | "instagram_url"
  | "website_url";

export type InstructorPatch = Partial<Record<InstructorPatchKey, string | null>>;

export type InstructorPatchResult =
  | { ok: true; patch: InstructorPatch }
  | { ok: false; error: string; field?: string; status: 422 };

const schema = z.object({
  headline: z.string().trim().max(HEADLINE_MAX).nullish(),
  bio: z.string().trim().max(BIO_MAX).nullish(),
  linkedin_url: z.string().nullish(),
  instagram_url: z.string().nullish(),
  website_url: z.string().nullish(),
});

export function buildInstructorPatch(body: unknown): InstructorPatchResult {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Validación fallida", status: 422 };
  }

  const patch: InstructorPatch = {};

  // Texto: se guarda `null` y no cadena vacía. Un `""` haría que la ficha crea
  // que hay contenido y le pinte al alumno una tarjeta en blanco.
  if ("headline" in parsed.data) patch.headline = parsed.data.headline?.trim() || null;
  if ("bio" in parsed.data) patch.bio = parsed.data.bio?.trim() || null;

  // URLs: se normalizan (completa `https://` si falta) y se rechaza lo que no
  // sea un enlace https válido ANTES de que el CHECK de la migración 0086
  // devuelva un error de Postgres ilegible para quien está usando el formulario.
  for (const field of URL_FIELDS) {
    if (!(field in parsed.data)) continue;
    const result = normalizeProfileUrl(parsed.data[field]);
    if (!result.ok) {
      return { ok: false, error: result.error, field, status: 422 };
    }
    patch[field] = result.value;
  }

  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      error: "Debe incluir al menos un campo a actualizar",
      status: 422,
    };
  }

  return { ok: true, patch };
}
