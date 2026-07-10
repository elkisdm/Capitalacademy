import { createClient } from "@/lib/supabase/server";
import { getActiveEnv, resolveProgramScope } from "@/lib/admin/active-env";
import { AdminCalendarClient, type AdminCalendarSession } from "./admin-calendar-client";

type SessionRow = {
  id: string;
  cohort_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  modality: string;
  status: string;
  teacher: { full_name: string | null } | null;
};

export default async function AdminCalendarPage(props: {
  searchParams: Promise<{ program?: string }>;
}) {
  const supabase = await createClient();

  const { data: programs } = await supabase
    .from("programs")
    .select("id, name")
    .order("name", { ascending: true });
  const programOptions = (programs ?? []) as { id: string; name: string }[];

  if (programOptions.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
        <h1 className="text-[34px] font-black tracking-[-0.025em] text-ca-ink">Calendario</h1>
        <p className="mb-4 mt-4 text-ca-ink-soft">No hay programas configurados.</p>
      </div>
    );
  }

  const { program: programParam } = await props.searchParams;
  const activeEnv = await getActiveEnv();
  const selectedProgramId = resolveProgramScope(programParam, activeEnv, programOptions)!;
  const programName = programOptions.find((p) => p.id === selectedProgramId)!.name;

  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name")
    .eq("program_id", selectedProgramId)
    .order("start_date", { ascending: false });
  const cohortList = (cohorts ?? []) as { id: string; name: string }[];
  const cohortNameById = new Map(cohortList.map((c) => [c.id, c.name]));
  const cohortIds = cohortList.map((c) => c.id);

  let sessions: AdminCalendarSession[] = [];
  if (cohortIds.length > 0) {
    const { data: sessionRows } = await supabase
      .from("class_sessions")
      .select("id, cohort_id, title, starts_at, ends_at, modality, status, teacher:instructors(full_name)")
      .in("cohort_id", cohortIds)
      .order("starts_at", { ascending: true });
    const allSessions = (sessionRows ?? []) as unknown as SessionRow[];
    sessions = allSessions.map((s) => ({
      id: s.id,
      cohort_id: s.cohort_id,
      cohort_name: cohortNameById.get(s.cohort_id) ?? "",
      title: s.title,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      modality: s.modality,
      status: s.status,
      teacher_name: s.teacher?.full_name ?? null,
    }));
  }

  return (
    <AdminCalendarClient
      sessions={sessions}
      programName={programName}
      multiCohort={cohortList.length > 1}
    />
  );
}
