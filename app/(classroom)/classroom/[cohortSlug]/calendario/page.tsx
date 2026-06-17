import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCohortWithProgram,
  getCohortSchedule,
} from "@/lib/classroom/queries";
import { getClassroomAccess } from "@/lib/classroom/access";
import { resolveCohortSlug } from "@/lib/classroom/resolve-slugs";
import { CohortCalendarClient } from "./cohort-calendar-client";

export default async function CohortCalendarPage(
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

  const sessions = await getCohortSchedule(cohortId);

  return <CohortCalendarClient sessions={sessions} cohortName={cohort.name} />;
}
