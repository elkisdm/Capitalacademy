import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import type {
  ClassSession,
  SessionInstructor,
  SessionResource,
} from "@/lib/classroom/types";
import { getReadyRecordingLessonIds } from "@/lib/classroom/queries";
import { SessionsManagerClient } from "./sessions-manager-client";

export default async function AdminCohortSessionsPage(
  props: {
    params: Promise<{ cohortId: string }>;
    searchParams: Promise<{ session?: string; nueva?: string }>;
  },
) {
  const { cohortId } = await props.params;
  const { session: focusSessionId, nueva } = await props.searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await getAuthUser();

  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: cohort },
    { data: sessionsData },
    { data: instructorsData },
  ] = await Promise.all([
    supabase.from("profiles").select("system_role").eq("id", user.id).single(),
    supabase
      .from("cohorts")
      .select("id, name, code, programs(id, name)")
      .eq("id", cohortId)
      .single(),
    supabase
      .from("class_sessions")
      .select("*")
      .eq("cohort_id", cohortId)
      .order("starts_at", { ascending: true }),
    supabase
      .from("instructors")
      .select("id, full_name, photo_url")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);

  if (!profile || !["ops", "admin"].includes(profile.system_role)) {
    redirect("/classroom");
  }

  if (!cohort) notFound();

  const sessionIds = (sessionsData ?? []).map((s) => s.id);
  const programId = (cohort.programs as { id: string; name: string } | null)?.id;

  const [{ data: resourcesData }, { data: modulesData }] = await Promise.all([
    sessionIds.length
      ? supabase
          .from("session_resources")
          .select("id, session_id, title, type, url, storage_path, position")
          .in("session_id", sessionIds)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] as SessionResource[] }),
    programId
      ? supabase
          .from("program_modules")
          .select("id, title, position")
          .eq("program_id", programId)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; title: string; position: number }[] }),
  ]);

  const sessions = (sessionsData ?? []) as unknown as ClassSession[];

  // Qué clases ya tienen su repetición publicada. El estado real vive en la
  // lección-repetición (mux_playback_id), no en class_sessions: sin esto el
  // listado no puede distinguir "preparada pero sin video" de "lista".
  const readyLessonIds = await getReadyRecordingLessonIds(
    sessions.map((s) => s.lesson_id).filter((id): id is string => Boolean(id)),
  );
  const readyRecordingSessionIds = sessions
    .filter((s) => Boolean(s.lesson_id && readyLessonIds.has(s.lesson_id)))
    .map((s) => s.id);

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
        abrirCreacion={nueva === "1"}
        readyRecordingSessionIds={readyRecordingSessionIds}
      />
    </div>
  );
}
