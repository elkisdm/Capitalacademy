import { createClient } from "@/lib/supabase/server";

/**
 * Cohorte que el staff previsualiza en "Ver como Alumno": el del entorno
 * (programa) activo del switcher, NO su matrícula propia.
 *
 * El staff entra a cualquier cohorte vía getClassroomAccess (rama isStaff),
 * aunque no esté matriculado — por eso la preview se resuelve por el entorno
 * activo y no por sus enrollments. Devuelve el slug (o id) del cohorte más
 * reciente de ese programa, o null si no hay entorno activo o no tiene cohortes.
 */
export async function getActiveEnvCohortSlug(
  activeEnv: string | null,
): Promise<string | null> {
  if (!activeEnv) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("cohorts")
    .select("id, slug")
    .eq("program_id", activeEnv)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return (data.slug as string | null) ?? (data.id as string);
}
