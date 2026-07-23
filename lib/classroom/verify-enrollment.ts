import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Verifies that a user is enrolled in a program that contains the given lesson.
 *
 * Replaces el patrón de 4 consultas secuenciales (lesson → module → cohort →
 * enrollment) con 2 consultas usando joins:
 *   1. lesson + program_modules join → program_id
 *   2. enrollments + cohorts!inner join → matrícula activa en ese programa
 *
 * Returns the enrollment ID if found, or null if the user is not enrolled.
 */
export async function verifyEnrollment(
  userId: string,
  lessonId: string,
): Promise<string | null> {
  const admin = createAdminClient();

  // Query 1: lesson → program_id via join
  const { data: lesson, error: lessonError } = await admin
    .from("lessons")
    .select("id, module_id, program_modules!inner(program_id)")
    .eq("id", lessonId)
    .single();

  if (lessonError && lessonError.code !== "PGRST116") {
    console.error("[verifyEnrollment] lesson query failed", lessonId, lessonError);
  }
  if (!lesson) return null;

  const programId = (lesson.program_modules as { program_id: string } | null)
    ?.program_id;
  if (!programId) return null;

  // Query 2: matrícula activa en una cohorte activa/planificada de ese programa,
  // resuelta en un solo viaje con join embebido (antes eran 2 consultas).
  const { data: enrollment, error: enrollmentError } = await admin
    .from("enrollments")
    .select("id, cohorts!inner(program_id, status)")
    .eq("student_id", userId)
    .eq("status", "active")
    .eq("cohorts.program_id", programId)
    .in("cohorts.status", ["active", "planned"])
    .limit(1)
    .maybeSingle();

  if (enrollmentError) {
    console.error(
      "[verifyEnrollment] enrollment query failed",
      lessonId,
      enrollmentError,
    );
  }

  return enrollment?.id ?? null;
}
