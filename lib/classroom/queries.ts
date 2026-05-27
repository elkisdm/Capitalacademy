import { createClient } from "@/lib/supabase/server";
import type {
  ModuleWithLessons,
  VideoProgress,
  LessonResource,
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
  let resourcesMap = new Map<string, LessonResource[]>();

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
