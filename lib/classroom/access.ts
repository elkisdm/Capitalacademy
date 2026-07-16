import { createClient } from "@/lib/supabase/server";
import { getEnrollmentForUser } from "./queries";

type Enrollment = Awaited<ReturnType<typeof getEnrollmentForUser>>;

export type ClassroomAccess = {
  /** Matrícula activa del usuario en el cohort, o null si es staff sin matrícula. */
  enrollment: Enrollment;
  /** true cuando el acceso se concede por rol (admin/ops), no por matrícula. */
  isStaff: boolean;
};

/**
 * Resuelve si un usuario puede ver el classroom de un cohort.
 *
 * Regla (RBAC ADR-0004): un alumno entra con matrícula activa; el staff
 * (admin/ops) entra siempre para previsualizar y dar soporte, aunque no esté
 * matriculado. En ese caso `enrollment` es null y la UI muestra los módulos
 * sin progreso personal.
 *
 * Devuelve null cuando el usuario no tiene acceso (ni matrícula ni rol staff):
 * el caller debe hacer notFound().
 */
export async function getClassroomAccess(
  userId: string,
  cohortId: string,
): Promise<ClassroomAccess | null> {
  const enrollment = await getEnrollmentForUser(userId, cohortId);
  if (enrollment) return { enrollment, isStaff: false };

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, system_role")
    .eq("id", userId)
    .single();

  const sysRole = profile?.system_role ?? profile?.role;
  if (sysRole === "admin" || sysRole === "ops") {
    return { enrollment: null, isStaff: true };
  }

  // Docente/asistente de ESTE cohort (cohort_roles, no system_role): acceso
  // staff-preview acotado a las cohortes donde realmente tiene el rol.
  const { data: cohortRole } = await supabase
    .from("cohort_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("cohort_id", cohortId)
    .in("role", ["teacher", "assistant"])
    .limit(1)
    .maybeSingle();
  if (cohortRole) {
    return { enrollment: null, isStaff: true };
  }

  return null;
}
