import { createClient } from "@/lib/supabase/server";
import { resolveResourceUrls } from "./resource-urls";
import type {
  ModuleWithLessons,
  VideoProgress,
  LessonResource,
  ClassSession,
  ScheduleSession,
  SessionInstructor,
  SessionResource,
  SessionEvaluationRef,
} from "./types";

/**
 * Mapa sessionId → quiz activo de la clase en vivo (evaluación scope='session').
 * Solo incluye las activas: una evaluación inactiva no se ofrece al alumno, igual
 * que el gate de `resolveEvaluationAccess`. El acceso real lo sigue protegiendo
 * ese guard; este map solo decide si se pinta el CTA "Responder quiz".
 */
async function getActiveSessionEvaluations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionIds: string[],
): Promise<Map<string, SessionEvaluationRef>> {
  const map = new Map<string, SessionEvaluationRef>();
  if (sessionIds.length === 0) return map;
  const { data } = await supabase
    .from("evaluations")
    .select("id, title, session_id")
    .in("session_id", sessionIds)
    .eq("scope", "session")
    .eq("is_active", true);
  for (const e of (data ?? []) as { id: string; title: string; session_id: string }[]) {
    map.set(e.session_id, { id: e.id, title: e.title });
  }
  return map;
}

export async function getCohortSlugById(cohortId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cohorts")
    .select("slug")
    .eq("id", cohortId)
    .single();
  return data?.slug ?? null;
}

// Acceso al contenido = matrícula no revocada. RN-049/050 + RN-T03: el estado
// académico ('completed' al cerrar la cohorte) NO corta el acceso técnico; solo
// 'dropped'/'suspended' lo hacen. Debe espejar las policies RLS de catálogo (0030).
const CONTENT_ACCESS_STATUSES = ["active", "completed"] as const;

export async function getEnrollmentForUser(userId: string, cohortId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select("id, status, cohort_id, student_id")
    .eq("student_id", userId)
    .eq("cohort_id", cohortId)
    .in("status", CONTENT_ACCESS_STATUSES)
    .maybeSingle();
  return data;
}

/**
 * Programas que el alumno puede abrir (matrícula no revocada), para el selector
 * de "Mis programas". Usa CONTENT_ACCESS_STATUSES para espejar el gate del
 * classroom: un alumno con el Diplomado y la Capacitación CI activos ve ambos.
 * Ordenado por matrícula más reciente primero.
 */
export type ActiveEnrollmentProgram = {
  cohortId: string;
  cohortSlug: string | null;
  cohortName: string | null;
  programId: string;
  programName: string;
  programCode: string | null;
  programDescription: string | null;
};

export async function getActiveEnrollmentsForUser(
  userId: string,
): Promise<ActiveEnrollmentProgram[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select(
      "enrolled_at, cohorts!inner(id, slug, name, programs!inner(id, name, code, description))",
    )
    .eq("student_id", userId)
    .in("status", CONTENT_ACCESS_STATUSES)
    .order("enrolled_at", { ascending: false });

  type Row = {
    cohorts: {
      id: string;
      slug: string | null;
      name: string | null;
      programs: {
        id: string;
        name: string;
        code: string | null;
        description: string | null;
      };
    };
  };

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    cohortId: r.cohorts.id,
    cohortSlug: r.cohorts.slug,
    cohortName: r.cohorts.name,
    programId: r.cohorts.programs.id,
    programName: r.cohorts.programs.name,
    programCode: r.cohorts.programs.code,
    programDescription: r.cohorts.programs.description,
  }));
}

export async function getCohortWithProgram(cohortId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cohorts")
    .select("*, programs(*)")
    .eq("id", cohortId)
    .single();
  return data;
}

export async function getModulesWithLessons(
  programId: string,
  enrollmentId: string | null,
): Promise<ModuleWithLessons[]> {
  const supabase = await createClient();

  const { data: modules } = await supabase
    .from("program_modules")
    .select(
      `
      *,
      teacher:profiles!program_modules_teacher_id_fkey(full_name),
      lessons(
        *
      )
    `,
    )
    .eq("program_id", programId)
    .order("position", { ascending: true });

  if (!modules) return [];

  const lessonIds = modules.flatMap((m) =>
    (m.lessons ?? []).map((l: { id: string }) => l.id),
  );

  let progressMap = new Map<string, VideoProgress>();
  const resourcesMap = new Map<string, LessonResource[]>();
  // Lecciones que son la repetición de una clase EN VIVO: se excluyen del
  // playlist normal del módulo (se ven en la pantalla de la clase, no como
  // lección suelta). Ver migración 0041.
  let recordingLessonIds = new Set<string>();

  if (lessonIds.length > 0) {
    // Sin matrícula (staff en modo previsualización) no hay progreso personal:
    // se omite la consulta y los módulos se muestran con progreso vacío.
    const [{ data: progress }, { data: resources }, { data: recLinks }] =
      await Promise.all([
        enrollmentId
          ? supabase
              .from("video_progress")
              .select("*")
              .eq("enrollment_id", enrollmentId)
              .in("lesson_id", lessonIds)
          : Promise.resolve({ data: null }),
        supabase
          .from("lesson_resources")
          .select("*")
          .in("lesson_id", lessonIds)
          .order("position", { ascending: true }),
        supabase
          .from("class_sessions")
          .select("lesson_id")
          .in("lesson_id", lessonIds),
      ]);

    if (progress) {
      progressMap = new Map(progress.map((p) => [p.lesson_id, p as VideoProgress]));
    }
    if (resources) {
      for (const r of resources as LessonResource[]) {
        const existing = resourcesMap.get(r.lesson_id) ?? [];
        existing.push(r);
        resourcesMap.set(r.lesson_id, existing);
      }
    }
    recordingLessonIds = new Set(
      ((recLinks ?? []) as Array<{ lesson_id: string | null }>)
        .map((r) => r.lesson_id)
        .filter((id): id is string => Boolean(id)),
    );
  }

  return modules.map((mod) => ({
    ...mod,
    teacher: mod.teacher as { full_name: string | null } | null,
    lessons: ((mod.lessons ?? []) as Array<Record<string, unknown>>)
      .filter((lesson) => !recordingLessonIds.has(lesson.id as string))
      .sort(
        (a: Record<string, unknown>, b: Record<string, unknown>) =>
          (a.position as number) - (b.position as number),
      )
      .map((lesson) => ({
        ...lesson,
        video_progress: progressMap.get(lesson.id as string) ?? null,
        resources: resourcesMap.get(lesson.id as string) ?? [],
      })),
  })) as ModuleWithLessons[];
}

/**
 * Sesiones de un módulo específico dentro de un cohorte.
 * Mismo patrón que getCohortSchedule pero filtrado por module_id.
 */
export async function getModuleSessionsForCohort(
  cohortId: string,
  moduleId: string,
): Promise<ScheduleSession[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("class_sessions")
    .select("*")
    .eq("cohort_id", cohortId)
    .eq("module_id", moduleId)
    .order("starts_at", { ascending: true });

  const sessions = (data ?? []) as unknown as ClassSession[];
  if (sessions.length === 0) return [];

  const teacherIds = [
    ...new Set(
      sessions
        .map((s) => s.teacher_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const teacherMap = new Map<string, SessionInstructor>();
  if (teacherIds.length > 0) {
    const { data: instructors } = await supabase
      .from("instructors")
      .select("id, full_name, photo_url")
      .in("id", teacherIds);
    for (const i of (instructors ?? []) as SessionInstructor[]) {
      teacherMap.set(i.id, i);
    }
  }

  const sessionIds = sessions.map((s) => s.id);
  const resourcesMap = new Map<string, SessionResource[]>();
  if (sessionIds.length > 0) {
    const { data: resources } = await supabase
      .from("session_resources")
      .select("id, session_id, title, type, url, storage_path, position")
      .in("session_id", sessionIds)
      .order("position", { ascending: true });
    const resolved = await resolveResourceUrls((resources ?? []) as SessionResource[]);
    for (const r of resolved) {
      const arr = resourcesMap.get(r.session_id) ?? [];
      arr.push(r);
      resourcesMap.set(r.session_id, arr);
    }
  }

  const evalMap = await getActiveSessionEvaluations(supabase, sessionIds);

  return sessions.map((s) => ({
    ...s,
    teacher: s.teacher_id ? (teacherMap.get(s.teacher_id) ?? null) : null,
    resources: resourcesMap.get(s.id) ?? [],
    evaluation: evalMap.get(s.id) ?? null,
  }));
}

/**
 * Calendario de sesiones en vivo de un cohorte, ordenado por fecha.
 *
 * Lee class_sessions (RLS: matrícula activa o staff, ver migración 0023) y
 * resuelve el docente desde el catálogo `instructors` con un segundo query +
 * join en JS — se evita el embed por FK porque los tipos generados aún no
 * incluyen class_sessions.teacher_id (se agrega en 0022).
 */
export async function getCohortSchedule(
  cohortId: string,
): Promise<ScheduleSession[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("class_sessions")
    .select("*")
    .eq("cohort_id", cohortId)
    .order("starts_at", { ascending: true });

  const sessions = (data ?? []) as unknown as ClassSession[];
  if (sessions.length === 0) return [];

  const teacherIds = [
    ...new Set(
      sessions
        .map((s) => s.teacher_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const teacherMap = new Map<string, SessionInstructor>();
  if (teacherIds.length > 0) {
    const { data: instructors } = await supabase
      .from("instructors")
      .select("id, full_name, photo_url")
      .in("id", teacherIds);

    for (const i of (instructors ?? []) as SessionInstructor[]) {
      teacherMap.set(i.id, i);
    }
  }

  // Recursos asociados a cada sesión (materiales de clases presenciales/online).
  const sessionIds = sessions.map((s) => s.id);
  const resourcesMap = new Map<string, SessionResource[]>();
  if (sessionIds.length > 0) {
    const { data: resources } = await supabase
      .from("session_resources")
      .select("id, session_id, title, type, url, storage_path, position")
      .in("session_id", sessionIds)
      .order("position", { ascending: true });

    const resolved = await resolveResourceUrls((resources ?? []) as SessionResource[]);
    for (const r of resolved) {
      const arr = resourcesMap.get(r.session_id) ?? [];
      arr.push(r);
      resourcesMap.set(r.session_id, arr);
    }
  }

  const evalMap = await getActiveSessionEvaluations(supabase, sessionIds);

  return sessions.map((s) => ({
    ...s,
    teacher: s.teacher_id ? (teacherMap.get(s.teacher_id) ?? null) : null,
    resources: resourcesMap.get(s.id) ?? [],
    evaluation: evalMap.get(s.id) ?? null,
  }));
}

export async function getLessonById(lessonId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lessons")
    .select("*, program_modules(*, programs(*))")
    .eq("id", lessonId)
    .single();
  return data;
}

export type SessionRecordingLesson = {
  id: string;
  title: string;
  slug: string | null;
  mux_playback_id: string | null;
  video_duration_seconds: number | null;
};

export type StudentSession = ClassSession & {
  teacher: SessionInstructor | null;
  resources: SessionResource[];
  recording: SessionRecordingLesson | null;
  evaluation: SessionEvaluationRef | null;
};

/**
 * Una clase EN VIVO para la pantalla de clase del alumno: la sesión + su docente,
 * recursos (URLs resueltas), la repetición (lección `recorded` enlazada vía
 * class_sessions.lesson_id, si existe) y su quiz activo. RLS de class_sessions
 * (0023) y lessons (0028) ya gatean el acceso por matrícula. Ver migración 0041.
 */
export async function getSessionForStudent(
  sessionId: string,
): Promise<StudentSession | null> {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("class_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return null;
  const s = session as unknown as ClassSession;

  const [teacherRes, resourcesRes, evalMap] = await Promise.all([
    s.teacher_id
      ? supabase
          .from("instructors")
          .select("id, full_name, photo_url")
          .eq("id", s.teacher_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("session_resources")
      .select("id, session_id, title, type, url, storage_path, position")
      .eq("session_id", sessionId)
      .order("position", { ascending: true }),
    getActiveSessionEvaluations(supabase, [sessionId]),
  ]);

  const resources = await resolveResourceUrls(
    (resourcesRes.data ?? []) as SessionResource[],
  );

  let recording: SessionRecordingLesson | null = null;
  if (s.lesson_id) {
    const { data: lesson } = await supabase
      .from("lessons")
      .select("id, title, slug, mux_playback_id, video_duration_seconds")
      .eq("id", s.lesson_id)
      .maybeSingle();
    recording = (lesson as SessionRecordingLesson | null) ?? null;
  }

  return {
    ...s,
    teacher: (teacherRes.data as SessionInstructor | null) ?? null,
    resources,
    recording,
    evaluation: evalMap.get(sessionId) ?? null,
  };
}

/**
 * Si una lección es la repetición (grabación Mux) de una clase EN VIVO —enlazada
 * vía class_sessions.lesson_id (0041)—, devuelve a dónde redirigir para que el
 * acceso pase siempre por la pantalla de la clase y no por la lección suelta.
 * La grabación se excluye del playlist del módulo, pero una URL directa/bookmark
 * aún podría apuntar a ella. Se redirige a la cohorte REAL de la sesión, porque
 * la pantalla de clase valida `session.cohort_id`.
 */
export async function getSessionRecordingRedirect(
  lessonId: string,
): Promise<{ cohortSlug: string; sessionId: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_sessions")
    .select("id, cohort_id, cohorts(slug)")
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    cohort_id: string;
    cohorts: { slug: string | null } | null;
  };
  return {
    sessionId: row.id,
    cohortSlug: row.cohorts?.slug ?? row.cohort_id,
  };
}

export async function getLessonProgress(
  enrollmentId: string | null,
  lessonId: string,
): Promise<VideoProgress | null> {
  if (!enrollmentId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("video_progress")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lessonId)
    .single();
  return data as VideoProgress | null;
}
