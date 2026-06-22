import { createClient } from "@/lib/supabase/server";
import { AddLessonButton } from "@/components/admin/add-lesson-button";
import { LessonReorderList } from "@/components/admin/lesson-reorder-list";
import { AddModuleButton } from "@/components/admin/add-module-button";
import { ModuleEditForm } from "@/components/admin/module-edit-form";
import { LessonsScopeFilter } from "@/components/admin/lessons-scope-filter";
import { ModuleSessionsList } from "@/components/admin/module-sessions-list";
import { getActiveEnv, resolveProgramScope } from "@/lib/admin/active-env";

type SessionRow = {
  id: string;
  title: string | null;
  starts_at: string;
  modality: string;
  module_id: string | null;
  teacher: { full_name: string | null } | null;
};

type SessionResourceRow = {
  id: string;
  session_id: string;
  title: string;
  type: string;
  url: string | null;
  storage_path: string | null;
  file_size_bytes: number | null;
  position: number;
};

export default async function AdminLessonsPage(props: {
  searchParams: Promise<{ program?: string; cohort?: string }>;
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
        <h1 className="text-2xl font-bold text-ca-ink">Gestión de lecciones</h1>
        <p className="mb-4 mt-4 text-ca-ink-soft">No hay programas configurados.</p>
      </div>
    );
  }

  // Scope por programa (el tenant) + cohorte. Las lecciones grabadas son del
  // programa; las clases en vivo (class_sessions), de la cohorte seleccionada.
  const { program: programParam, cohort: cohortParam } = await props.searchParams;
  // Precedencia: `?program` > entorno global (cookie) > primer programa.
  const activeEnv = await getActiveEnv();
  const selectedProgramId = resolveProgramScope(programParam, activeEnv, programOptions)!;

  const [{ data: cohorts }, { data: modules }] = await Promise.all([
    supabase
      .from("cohorts")
      .select("id, name")
      .eq("program_id", selectedProgramId)
      .order("start_date", { ascending: false }),
    supabase
      .from("program_modules")
      .select(`*, programs(name, code), lessons(*)`)
      .eq("program_id", selectedProgramId)
      .order("position", { ascending: true }),
  ]);

  const cohortOptions = (cohorts ?? []) as { id: string; name: string }[];
  const selectedCohortId =
    cohortOptions.find((c) => c.id === cohortParam)?.id ?? cohortOptions[0]?.id ?? null;

  // Clases en vivo de la cohorte, agrupadas por módulo.
  const sessionsByModule = new Map<string, SessionRow[]>();
  const resourcesBySession = new Map<string, SessionResourceRow[]>();
  if (selectedCohortId) {
    const { data: sessionRows } = await supabase
      .from("class_sessions")
      .select("id, title, starts_at, modality, module_id, teacher:instructors(full_name)")
      .eq("cohort_id", selectedCohortId)
      .not("module_id", "is", null)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true });
    const allSessions = (sessionRows ?? []) as unknown as SessionRow[];
    for (const s of allSessions) {
      if (!s.module_id) continue;
      const arr = sessionsByModule.get(s.module_id) ?? [];
      arr.push(s);
      sessionsByModule.set(s.module_id, arr);
    }

    // Material ya cargado por sesión (para editarlo inline, sin ir al calendario).
    const sessionIds = allSessions.map((s) => s.id);
    if (sessionIds.length > 0) {
      const { data: resRows } = await supabase
        .from("session_resources")
        .select("id, session_id, title, type, url, storage_path, file_size_bytes, position")
        .in("session_id", sessionIds)
        .order("position", { ascending: true });
      for (const r of (resRows ?? []) as SessionResourceRow[]) {
        const arr = resourcesBySession.get(r.session_id) ?? [];
        arr.push(r);
        resourcesBySession.set(r.session_id, arr);
      }
    }
  }

  const scopeFilter = (
    <LessonsScopeFilter
      programs={programOptions}
      cohorts={cohortOptions}
      selectedProgramId={selectedProgramId}
      selectedCohortId={selectedCohortId}
    />
  );

  if (!modules || modules.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-ca-ink">Gestión de lecciones</h1>
          <AddModuleButton programs={programOptions} />
        </div>
        {scopeFilter}
        <p className="mb-4 mt-4 text-ca-ink-soft">
          Este programa no tiene módulos configurados aún. Crea el primero.
        </p>
      </div>
    );
  }

  const moduleOptions = modules.map((m) => ({
    id: m.id as string,
    title: m.title as string,
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ca-ink">Gestión de lecciones</h1>
        <AddModuleButton programs={programOptions} />
      </div>
      <div className="mb-8">{scopeFilter}</div>

      <div className="space-y-10">
        {modules.map((mod) => {
          const program = mod.programs as { name: string; code: string } | null;
          const lessons = ((mod.lessons ?? []) as Array<Record<string, unknown>>).sort(
            (a, b) => (a.position as number) - (b.position as number),
          );
          const siblingModules = moduleOptions.filter((m) => m.id !== mod.id);
          const moduleSessions = sessionsByModule.get(mod.id as string) ?? [];

          return (
            <section key={mod.id}>
              <div className="mb-3 border-b border-ca-ink/[0.08] pb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-ca-ink-soft">
                  {program?.name ?? "Programa"}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ca-ink">
                    {mod.code} — {mod.title}
                  </h2>
                  <ModuleEditForm
                    module={{
                      id: mod.id as string,
                      code: mod.code as string,
                      title: mod.title as string,
                      description: (mod.description as string | null) ?? null,
                    }}
                  />
                </div>
              </div>

              {/* Lecciones grabadas */}
              <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                Lecciones grabadas
              </p>
              {lessons.length === 0 ? (
                <p className="text-sm text-ca-ink-soft">Sin lecciones grabadas en este módulo.</p>
              ) : (
                <LessonReorderList
                  moduleId={mod.id as string}
                  siblingModules={siblingModules}
                  lessons={lessons.map((lesson) => ({
                    id: lesson.id as string,
                    title: lesson.title as string,
                    kind: lesson.kind as string,
                    hasVideo: !!(lesson.mux_playback_id as string | null),
                  }))}
                />
              )}
              <AddLessonButton moduleId={mod.id as string} />

              {/* Clases en vivo (calendario) */}
              {selectedCohortId && (
                <div className="mt-5">
                  <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Clases en vivo (calendario)
                  </p>
                  <ModuleSessionsList
                    cohortId={selectedCohortId}
                    siblingModules={siblingModules}
                    sessions={moduleSessions.map((s) => ({
                      id: s.id,
                      title: s.title ?? "Clase",
                      startsAt: s.starts_at,
                      modality: s.modality,
                      teacherName: s.teacher?.full_name ?? null,
                      resources: resourcesBySession.get(s.id) ?? [],
                    }))}
                  />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
