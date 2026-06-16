import { createClient } from "@/lib/supabase/server";
import type {
  ModuleWithLessons,
  VideoProgress,
  LessonResource,
  ClassSession,
  ScheduleSession,
  SessionInstructor,
  SessionResource,
} from "./types";

export async function getCohortSlugById(cohortId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cohorts")
    .select("slug")
    .eq("id", cohortId)
    .single();
  return data?.slug ?? null;
}

export async function getEnrollmentForUser(userId: string, cohortId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("enrollments")
    .select("id, status, cohort_id, student_id")
    .eq("student_id", userId)
    .eq("cohort_id", cohortId)
    .eq("status", "active")
    .single();
  return data;
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
  enrollmentId: string,
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

  if (lessonIds.length > 0) {
    const [{ data: progress }, { data: resources }] = await Promise.all([
      supabase
        .from("video_progress")
        .select("*")
        .eq("enrollment_id", enrollmentId)
        .in("lesson_id", lessonIds),
      supabase
        .from("lesson_resources")
        .select("*")
        .in("lesson_id", lessonIds)
        .order("position", { ascending: true }),
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
  }

  return modules.map((mod) => ({
    ...mod,
    teacher: mod.teacher as { full_name: string | null } | null,
    lessons: ((mod.lessons ?? []) as Array<Record<string, unknown>>)
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
      .select("id, session_id, title, type, url, position")
      .in("session_id", sessionIds)
      .order("position", { ascending: true });

    for (const r of (resources ?? []) as SessionResource[]) {
      const arr = resourcesMap.get(r.session_id) ?? [];
      arr.push(r);
      resourcesMap.set(r.session_id, arr);
    }
  }

  return sessions.map((s) => ({
    ...s,
    teacher: s.teacher_id ? (teacherMap.get(s.teacher_id) ?? null) : null,
    resources: resourcesMap.get(s.id) ?? [],
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

export async function getLessonProgress(
  enrollmentId: string,
  lessonId: string,
): Promise<VideoProgress | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("video_progress")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lessonId)
    .single();
  return data as VideoProgress | null;
}
