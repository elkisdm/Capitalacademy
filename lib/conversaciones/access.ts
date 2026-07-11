import { createClient } from "@/lib/supabase/server";

export type ProgramAccess = { isStaff: boolean };

/**
 * Resuelve si el usuario es staff (docente/asistente vía `cohort_roles` de
 * alguna cohorte del programa, o admin/ops transversal) de un programa. Espeja
 * `is_program_staff()` de la BD (0057/0066). Centralizado acá para que
 * `[threadId]/route.ts` y `getProgramAccess` compartan una sola implementación
 * en vez de mantener el helper duplicado.
 */
export async function isProgramStaff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  programId: string,
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, system_role")
    .eq("id", userId)
    .single();

  const sysRole = profile?.system_role ?? profile?.role;
  if (sysRole === "admin" || sysRole === "ops") return true;

  const { data: cohortRole } = await supabase
    .from("cohort_roles")
    .select("id, cohorts!inner(program_id)")
    .eq("user_id", userId)
    .eq("cohorts.program_id", programId)
    .in("role", ["teacher", "assistant"])
    .limit(1)
    .maybeSingle();

  return Boolean(cohortRole);
}

/**
 * Resuelve si un usuario tiene acceso al foro de Conversaciones de un programa
 * (ADR-0010): matrícula active/completed en cualquier cohorte del programa,
 * o staff (docente/asistente de una cohorte del programa, o admin/ops).
 *
 * Devuelve null si no tiene acceso. Helper de respaldo: en la práctica las
 * pages ya resuelven acceso al cohort con `getClassroomAccess` y derivan el
 * programId desde ahí; este helper sirve para casos donde no se parte de un
 * cohort conocido — incluyendo al docente puro (sin matrícula), que antes
 * recibía 403 (hallazgo cerrado en T11).
 */
export async function getProgramAccess(
  userId: string,
  programId: string,
): Promise<ProgramAccess | null> {
  const supabase = await createClient();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, cohorts!inner(program_id)")
    .eq("student_id", userId)
    .eq("cohorts.program_id", programId)
    .in("status", ["active", "completed"])
    .limit(1)
    .single();

  if (enrollment) return { isStaff: false };

  if (await isProgramStaff(supabase, userId, programId)) {
    return { isStaff: true };
  }

  return null;
}
