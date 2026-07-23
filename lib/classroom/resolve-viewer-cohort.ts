import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Para las rutas neutras `classroom/go/*` (enlaces de campana/correo que no
 * conocen la cohorte del destinatario): dado un `programId`, encuentra una
 * cohorte de ese programa donde el viewer tenga acceso, sin filtrar existencia
 * cross-tenant (el caller debe hacer `notFound()` si devuelve null, nunca
 * distinguir "no existe" de "sin acceso").
 *
 * Orden de resolución: matrícula active/completed → docente/asistente
 * (`cohort_roles`) → staff transversal (`system_role` admin/ops, recibe
 * cualquier cohorte del programa para navegar).
 */
export async function resolveViewerCohortForProgram(
  userId: string,
  programId: string,
): Promise<{ id: string; slug: string } | null> {
  const supabase = createAdminClient();

  const { data: rows, error: cohortsError } = await supabase
    .from("cohorts")
    .select("id, slug")
    .eq("program_id", programId);
  if (cohortsError) {
    console.error("[resolveViewerCohortForProgram] error al buscar cohortes del programa", {
      userId,
      programId,
      code: cohortsError.code,
      message: cohortsError.message,
    });
    throw cohortsError;
  }
  if (!rows || rows.length === 0) return null;
  // slug ?? id: mismo fallback que usan las páginas del classroom (cohortSlug).
  const cohorts = rows.map((c) => ({ id: c.id, slug: c.slug ?? c.id }));
  const cohortIds = cohorts.map((c) => c.id);
  const bySlugId = new Map(cohorts.map((c) => [c.id, c]));

  const { data: enrollment, error: enrollmentError } = await supabase
    .from("enrollments")
    .select("cohort_id")
    .eq("student_id", userId)
    .in("cohort_id", cohortIds)
    .in("status", ["active", "completed"])
    .limit(1)
    .maybeSingle();
  if (enrollmentError) {
    console.error("[resolveViewerCohortForProgram] error al buscar matrícula", {
      userId,
      programId,
      code: enrollmentError.code,
      message: enrollmentError.message,
    });
    throw enrollmentError;
  }
  if (enrollment) return bySlugId.get(enrollment.cohort_id) ?? null;

  const { data: cohortRole, error: cohortRoleError } = await supabase
    .from("cohort_roles")
    .select("cohort_id")
    .eq("user_id", userId)
    .in("cohort_id", cohortIds)
    .in("role", ["teacher", "assistant"])
    .limit(1)
    .maybeSingle();
  if (cohortRoleError) {
    console.error("[resolveViewerCohortForProgram] error al buscar rol de cohorte", {
      userId,
      programId,
      code: cohortRoleError.code,
      message: cohortRoleError.message,
    });
    throw cohortRoleError;
  }
  if (cohortRole) return bySlugId.get(cohortRole.cohort_id) ?? null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role, role")
    .eq("id", userId)
    .maybeSingle();
  const sysRole = profile?.system_role ?? profile?.role;
  if (sysRole === "admin" || sysRole === "ops") return cohorts[0];

  return null;
}
