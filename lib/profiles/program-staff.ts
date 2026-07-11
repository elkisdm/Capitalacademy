import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resuelve el conjunto de `user_id` que cuentan como "staff" de un programa:
 * docentes/asistentes (`cohort_roles` teacher/assistant) de cualquier cohorte
 * del programa, más el staff transversal (`profiles.system_role` admin/ops).
 *
 * Vía service-role (RLS de `profiles`/`cohort_roles` no aplica). Se usa para
 * overlayar `is_staff=true` sobre `getPublicAuthorsMap` cuando el autor es un
 * docente que no es admin/ops (badge "Profesor/Equipo").
 */
export async function getProgramStaffIds(programId: string): Promise<Set<string>> {
  const supabase = createAdminClient();
  const ids = new Set<string>();

  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id")
    .eq("program_id", programId);
  const cohortIds = (cohorts ?? []).map((c) => c.id);

  if (cohortIds.length > 0) {
    const { data: roles } = await supabase
      .from("cohort_roles")
      .select("user_id")
      .in("cohort_id", cohortIds)
      .in("role", ["teacher", "assistant"]);
    for (const row of roles ?? []) ids.add(row.user_id);
  }

  const { data: staff } = await supabase
    .from("profiles")
    .select("id")
    .or("system_role.in.(admin,ops),role.in.(admin,ops)");
  for (const row of staff ?? []) ids.add(row.id);

  return ids;
}
