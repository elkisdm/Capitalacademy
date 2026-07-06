import { redirect, notFound } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
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

  const sessions = await getCohortSchedule(cohortId);

  return <CohortCalendarClient sessions={sessions} cohortName={cohort.name} />;
}
