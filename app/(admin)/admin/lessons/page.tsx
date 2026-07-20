import { Video, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { AddLessonButton } from "@/components/admin/add-lesson-button";
import { LessonReorderList } from "@/components/admin/lesson-reorder-list";
import { AddModuleButton } from "@/components/admin/add-module-button";
import { ModuleEditForm } from "@/components/admin/module-edit-form";
import { LessonsScopeFilter } from "@/components/admin/lessons-scope-filter";
import { ModuleSessionsList } from "@/components/admin/module-sessions-list";
import { getActiveEnv, resolveProgramScope } from "@/lib/admin/active-env";
import { getSessionRecordingLessonIds } from "@/lib/classroom/queries";

type SessionRow = {
  id: string;
  title: string | null;
  starts_at: string;
  modality: string;
  module_id: string | null;
  lesson_id: string | null;
  teacher: { full_name: string | null } | null;
};

type RecordingInfo = {
  lessonId: string;
  muxPlaybackId: string | null;
  muxUploadId: string | null;
  muxError: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
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
        <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
          Operaciones · Contenido
        </div>
        <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">Gestión de lecciones</h1>
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

  // Lecciones que son la repetición de una clase en vivo: se excluyen de
  // "Lecciones grabadas" y se muestran integradas en su fila de sesión.
  const allLessonIds = (modules ?? []).flatMap((m) =>
    ((m.lessons ?? []) as Array<{ id: string }>).map((l) => l.id),
  );
  const recordingLessonIds = await getSessionRecordingLessonIds(allLessonIds);
  const recordingByLessonId = new Map<string, RecordingInfo>();
  for (const mod of modules ?? []) {
    for (const lesson of (mod.lessons ?? []) as Array<Record<string, unknown>>) {
      recordingByLessonId.set(lesson.id as string, {
        lessonId: lesson.id as string,
        muxPlaybackId: (lesson.mux_playback_id as string | null) ?? null,
        muxUploadId: (lesson.mux_upload_id as string | null) ?? null,
        muxError: (lesson.mux_error as string | null) ?? null,
        durationSeconds: (lesson.video_duration_seconds as number | null) ?? null,
        thumbnailUrl: (lesson.thumbnail_url as string | null) ?? null,
      });
    }
  }

  // Clases en vivo de la cohorte, agrupadas por módulo.
  const sessionsByModule = new Map<string, SessionRow[]>();
  const resourcesBySession = new Map<string, SessionResourceRow[]>();
  if (selectedCohortId) {
    const { data: sessionRows } = await supabase
      .from("class_sessions")
      .select("id, title, starts_at, modality, module_id, lesson_id, teacher:instructors(full_name)")
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
          <div>
            <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
              Operaciones · Contenido
            </div>
            <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">Gestión de lecciones</h1>
          </div>
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
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <div className="font-sans text-[10px] font-bold uppercase tracking-[0.22em] text-ca-ink-soft">
            Operaciones · Contenido
          </div>
          <h1 className="mt-1 text-[34px] font-black tracking-[-0.025em] text-ca-ink">Gestión de lecciones</h1>
          <p className="mt-1 text-[14px] text-ca-ink-soft">
            Módulos, lecciones grabadas y clases en vivo por programa
          </p>
        </div>
        <AddModuleButton programs={programOptions} />
      </div>
      <div className="mb-8">{scopeFilter}</div>

      <div className="space-y-10">
        {modules.map((mod) => {
          const program = mod.programs as { name: string; code: string } | null;
          const lessons = ((mod.lessons ?? []) as Array<Record<string, unknown>>)
            .filter((l) => !recordingLessonIds.has(l.id as string))
            .sort((a, b) => (a.position as number) - (b.position as number));
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
                      cover_image_url:
                        ((mod as Record<string, unknown>).cover_image_url as string | null) ?? null,
                    }}
                  />
                </div>
              </div>

              {/* Lecciones grabadas */}
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Video className="h-3.5 w-3.5 text-ca-ink-soft" />
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                    Lecciones grabadas
                  </p>
                  <Badge tone="neutral" size="sm">
                    {lessons.length}
                  </Badge>
                </div>
                <AddLessonButton moduleId={mod.id as string} />
              </div>
              {lessons.length === 0 ? (
                <p className="rounded-lg border border-dashed border-ca-ink/[0.10] px-4 py-3 text-sm text-ca-ink-soft">
                  Sin lecciones grabadas en este módulo.
                </p>
              ) : (
                <LessonReorderList
                  moduleId={mod.id as string}
                  siblingModules={siblingModules}
                  lessons={lessons.map((lesson) => ({
                    id: lesson.id as string,
                    title: lesson.title as string,
                    kind: lesson.kind as string,
                    position: lesson.position as number,
                    muxPlaybackId: (lesson.mux_playback_id as string | null) ?? null,
                    thumbnailUrl: (lesson.thumbnail_url as string | null) ?? null,
                    durationSeconds: (lesson.video_duration_seconds as number | null) ?? null,
                    muxUploadId: (lesson.mux_upload_id as string | null) ?? null,
                    muxError: (lesson.mux_error as string | null) ?? null,
                    muxTrackId: (lesson.mux_track_id as string | null) ?? null,
                    hasContent: !!(lesson.content as string | null)?.trim(),
                    unlockAt: (lesson.unlock_at as string | null) ?? null,
                  }))}
                />
              )}

              {/* Clases en vivo (calendario) */}
              {selectedCohortId && (
                <div className="mt-5">
                  <div className="mb-2 flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-ca-ink-soft" />
                    <p className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-ca-ink-soft">
                      Clases en vivo (calendario)
                    </p>
                    <Badge tone="neutral" size="sm">
                      {moduleSessions.length}
                    </Badge>
                  </div>
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
                      recording: s.lesson_id ? (recordingByLessonId.get(s.lesson_id) ?? null) : null,
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
