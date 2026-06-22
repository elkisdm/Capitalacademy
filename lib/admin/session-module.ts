import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Verifica que un módulo pertenezca al programa indicado.
 *
 * Una sesión de calendario cuelga de una cohorte (y por tanto de su programa).
 * Vincularla a un módulo de OTRO programa rompe la integridad del calendario
 * (la sesión nunca aparecería en el aula correcta). La UI ya filtra el selector
 * por programa, pero la API debe validarlo igual: un POST/PATCH directo no pasa
 * por la UI.
 *
 * Devuelve un mensaje de error si el módulo no existe o no calza con el
 * programa; `null` si es válido o si no se está asignando módulo.
 */
export async function moduleInProgramError(
  admin: AdminClient,
  programId: string,
  moduleId: string | null | undefined,
): Promise<string | null> {
  if (!moduleId) return null;

  const { data: mod } = await admin
    .from("program_modules")
    .select("program_id")
    .eq("id", moduleId)
    .single();

  if (!mod) return "El módulo seleccionado no existe";
  if (mod.program_id !== programId) {
    return "El módulo no pertenece al programa de la cohorte";
  }
  return null;
}
