import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await getClassroomAccess(user.id, cohortId);
  if (!access) notFound();

  const cohort = await getCohortWithProgram(cohortId);
  if (!cohort) notFound();

  const program = cohort.programs as { id: string; name: string };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
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
