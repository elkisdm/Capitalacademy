import { createClient } from "@/lib/supabase/server";

export type ProgramAccess = { isStaff: boolean };

/**
 * Resuelve si un usuario tiene acceso al foro de Conversaciones de un programa
 * (ADR-0010): matrícula active/completed en cualquier cohorte del programa,
 * o staff (admin/ops).
 *
 * Devuelve null si no tiene acceso. Helper de respaldo: en la práctica las
 * pages ya resuelven acceso al cohort con `getClassroomAccess` y derivan el
 * programId desde ahí; este helper sirve para casos donde no se parte de un
 * cohort conocido.
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, system_role")
    .eq("id", userId)
    .single();

  const sysRole = profile?.system_role ?? profile?.role;
  if (sysRole === "admin" || sysRole === "ops") {
    return { isStaff: true };
  }

  return null;
}
