import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getAuthUser, getViewerProfile } from "@/lib/supabase/auth";
import { getClassroomAccess } from "@/lib/classroom/access";
import { getCohortWithProgram } from "@/lib/classroom/queries";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { QuizRunner } from "@/components/classroom/quiz-runner";

export const metadata: Metadata = {
  title: "Quiz final",
};

export default async function QuizPage(
  props: { params: Promise<{ cohortSlug: string }> },
) {
  const { cohortSlug } = await props.params;

  const cohortId = await resolveCohortSlug(cohortSlug);
  if (!cohortId) notFound();

  const {
    data: { user },
  } = await getAuthUser();
  if (!user) redirect("/login");

  const [access, cohort] = await Promise.all([
    getClassroomAccess(user.id, cohortId),
    getCohortWithProgram(cohortId),
  ]);
  if (!access) notFound();
  if (!cohort) notFound();

  const program = cohort.programs as { id: string; name: string };

  const profile = await getViewerProfile(user.id);
  const studentName = profile?.full_name ?? "Alumno";

  return (
    <QuizRunner
      programId={program.id}
      programTitle={program.name}
      studentName={studentName}
      cohortSlug={cohortSlug}
    />
  );
}
