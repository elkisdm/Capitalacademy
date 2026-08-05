import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authorizeAdmin } from "@/lib/auth/authorize-admin";
import { normalizeProfileUrl } from "@/lib/instructors/social";
import { uuidLike } from "@/lib/utils/zod";
import { INSTRUCTOR_PROFILE_COLUMNS } from "@/lib/instructors/types";

export const runtime = "nodejs";

/**
 * Edición del perfil público del docente (ADR-0028).
 *
 * Solo los campos que el alumno ve en `/classroom/[cohortSlug]/docente/[id]`.
 * NO se edita `full_name`, `email` ni `profile_id`: son la identidad de la ficha
 * y cambiarlos desde acá desalinearía el calendario y el puente con `profiles`.
 * Tampoco se crea ni se borra: el alta sigue viniendo del seed.
 *
 * La escritura la gatea la RLS (`instructors_staff_write`, solo platform staff);
 * `authorizeAdmin` es la primera barrera para devolver 401/403 con un mensaje
 * claro en vez de un 0-filas ambiguo.
 */
const URL_FIELDS = ["linkedin_url", "instagram_url", "website_url"] as const;

type InstructorPatchKey =
  | "headline"
  | "bio"
  | "linkedin_url"
  | "instagram_url"
  | "website_url";

const patchInstructorSchema = z
  .object({
    headline: z.string().trim().max(120).nullish(),
    bio: z.string().trim().max(4000).nullish(),
    linkedin_url: z.string().nullish(),
    instagram_url: z.string().nullish(),
    website_url: z.string().nullish(),
  })
  .refine(
    (o) => Object.keys(o).length > 0,
    "Debe incluir al menos un campo a actualizar",
  );

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ instructorId: string }> },
) {
  const auth = await authorizeAdmin();
  if ("error" in auth) return auth.error;

  const { instructorId } = await ctx.params;
  if (!uuidLike.safeParse(instructorId).success) {
    return NextResponse.json({ error: "Docente no encontrado" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = patchInstructorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const patch: Partial<Record<InstructorPatchKey, string | null>> = {};

  // Texto: se guarda `null` en vez de cadena vacía. Un `""` en la base haría que
  // `hasProfileContent` crea que hay contenido y pinte una tarjeta en blanco.
  if ("headline" in parsed.data) patch.headline = parsed.data.headline?.trim() || null;
  if ("bio" in parsed.data) patch.bio = parsed.data.bio?.trim() || null;

  // URLs: se normalizan (agrega https:// si falta) y se rechaza lo que no sea
  // un enlace https válido, ANTES de que el CHECK de la migración 0086 devuelva
  // un error de Postgres ilegible para quien está usando el panel.
  for (const field of URL_FIELDS) {
    if (!(field in parsed.data)) continue;
    const result = normalizeProfileUrl(parsed.data[field]);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, field }, { status: 422 });
    }
    patch[field] = result.value;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Debe incluir al menos un campo a actualizar" },
      { status: 422 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("instructors")
    // `headline` y las tres URLs son de la migración 0086 y todavía no están en
    // los tipos generados (`supabase gen types` corre DESPUÉS de aplicarla). El
    // cast es acotado a esta llamada: `InstructorPatchKey` mantiene el chequeo
    // de tipos de nuestro lado, y se puede borrar al regenerar los tipos.
    .update(patch as never)
    .eq("id", instructorId)
    .select(INSTRUCTOR_PROFILE_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("instructor update error", error);
    if (error.code === "42501") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    // 23514 = check_violation. Solo debería llegar si alguien saltó la
    // normalización de arriba; se traduce a un 422 legible en vez de un 500.
    if (error.code === "23514") {
      return NextResponse.json(
        { error: "Algún dato no cumple el formato permitido. Revisa los enlaces" },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "Error al actualizar el perfil del docente" },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Docente no encontrado" }, { status: 404 });
  }

  return NextResponse.json(data);
}
