import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Verifies that a user is enrolled in a program that contains the given lesson.
 *
 * Replaces the 4-sequential-query pattern (lesson → module → cohort → enrollment)
 * with 2 queries using joins:
 *   1. lesson + program_modules join → program_id
 *   2. cohorts by program_id → enrollment check via subquery
 *
 * Returns the enrollment ID if found, or null if the user is not enrolled.
 */
export async function verifyEnrollment(
  userId: string,
  lessonId: string,
): Promise<string | null> {
  const admin = createAdminClient();

  // Query 1: lesson → program_id via join
  const { data: lesson } = await admin
    .from("lessons")
    .select("id, module_id, program_modules!inner(program_id)")
    .eq("id", lessonId)
    .single();

  if (!lesson) return null;

  const programId = (lesson.program_modules as { program_id: string } | null)
    ?.program_id;
  if (!programId) return null;

  // Query 2: find cohort IDs for this program, then check enrollment
  const { data: cohorts } = await admin
    .from("cohorts")
    .select("id")
    .eq("program_id", programId)
    .in("status", ["active", "planned"]);

  const cohortIds = cohorts?.map((c) => c.id) ?? [];
  if (cohortIds.length === 0) return null;

  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", userId)
    .in("cohort_id", cohortIds)
    .eq("status", "active")
    .limit(1)
    .single();

  return enrollment?.id ?? null;
}
