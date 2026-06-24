import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  ClassSession,
  SessionInstructor,
  SessionResource,
} from "@/lib/classroom/types";
import { SessionsManagerClient } from "./sessions-manager-client";

export default async function AdminCohortSessionsPage(
  props: {
    params: Promise<{ cohortId: string }>;
    searchParams: Promise<{ session?: string }>;
  },
) {
  const { cohortId } = await props.params;
  const { session: focusSessionId } = await props.searchParams;

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
    .select("id, name, code, programs(id, name)")
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
        .select("id, session_id, title, type, url, storage_path, position")
        .in("session_id", sessionIds)
        .order("position", { ascending: true })
    : { data: [] };

  const programId = (cohort.programs as { id: string; name: string } | null)?.id;
  const { data: modulesData } = programId
    ? await supabase
        .from("program_modules")
        .select("id, title, position")
        .eq("program_id", programId)
        .order("position", { ascending: true })
    : { data: [] };

  const sessions = (sessionsData ?? []) as unknown as ClassSession[];
  const instructors = (instructorsData ?? []) as SessionInstructor[];
  const resources = (resourcesData ?? []) as SessionResource[];
  const modules = (modulesData ?? []) as { id: string; title: string; position: number }[];

  const programName =
    (cohort.programs as { name: string } | null)?.name ?? "Capital Academy";

  return (
    <div className="ca-fade-up mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-8">
      <SessionsManagerClient
        cohort={{ id: cohort.id, name: cohort.name, code: cohort.code }}
        programId={programId ?? null}
        programName={programName}
        initialSessions={sessions}
        instructors={instructors}
        initialResources={resources}
        modules={modules}
        focusSessionId={focusSessionId ?? null}
      />
    </div>
  );
}
