import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  ClassSession,
  SessionInstructor,
  SessionResource,
} from "@/lib/classroom/types";
import { SessionsManagerClient } from "./sessions-manager-client";

export default async function AdminCohortSessionsPage(
  props: { params: Promise<{ cohortId: string }> },
) {
  const { cohortId } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ops", "admin"].includes(profile.system_role)) {
    redirect("/classroom");
  }

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("id, name, code, programs(name)")
    .eq("id", cohortId)
    .single();

  if (!cohort) notFound();

  const { data: sessionsData } = await supabase
    .from("class_sessions")
    .select("*")
    .eq("cohort_id", cohortId)
    .order("starts_at", { ascending: true });

  const { data: instructorsData } = await supabase
    .from("instructors")
    .select("id, full_name, photo_url")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  const sessionIds = (sessionsData ?? []).map((s) => s.id);
  const { data: resourcesData } = sessionIds.length
    ? await supabase
        .from("session_resources")
        .select("id, session_id, title, type, url, position")
        .in("session_id", sessionIds)
        .order("position", { ascending: true })
    : { data: [] };

  const sessions = (sessionsData ?? []) as unknown as ClassSession[];
  const instructors = (instructorsData ?? []) as SessionInstructor[];
  const resources = (resourcesData ?? []) as SessionResource[];

  const programName =
    (cohort.programs as { name: string } | null)?.name ?? "Capital Academy";

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-8">
      <SessionsManagerClient
        cohort={{ id: cohort.id, name: cohort.name, code: cohort.code }}
        programName={programName}
        initialSessions={sessions}
        instructors={instructors}
        initialResources={resources}
      />
    </div>
  );
}
