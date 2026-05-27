import { createClient } from "@/lib/supabase/server";

export type CohortStudentProgress = {
  student_id: string;
  full_name: string;
  email: string;
  initials: string;
  enrollment_id: string;
  module_progress: Array<{
    module_id: string;
    module_title: string;
    module_position: number;
    total_lessons: number;
    completed_lessons: number;
    percentage: number;
  }>;
  overall_percentage: number;
  last_seen: string | null;
};

export async function getCohortProgressReport(cohortId: string) {
  const supabase = await createClient();

  const { data: cohort } = await supabase
    .from("cohorts")
    .select("*, programs(*)")
    .eq("id", cohortId)
    .single();

  if (!cohort) return null;

  const program = cohort.programs as { id: string; name: string };

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, student_id, profiles(full_name, email)")
    .eq("cohort_id", cohortId)
    .eq("status", "active");

  if (!enrollments) return { cohort, program, students: [] };

  const { data: modules } = await supabase
    .from("program_modules")
    .select("id, title, position")
    .eq("program_id", program.id)
    .order("position", { ascending: true });

  if (!modules) return { cohort, program, students: [] };

  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, module_id, mux_playback_id")
    .in(
      "module_id",
      modules.map((m) => m.id),
    );

  const enrollmentIds = enrollments.map((e) => e.id);
  let allProgress: Array<{
    enrollment_id: string;
    lesson_id: string;
    completed: boolean;
    last_watched_at: string;
  }> = [];

  if (enrollmentIds.length > 0) {
    const { data: progress } = await supabase
      .from("video_progress")
      .select("enrollment_id, lesson_id, completed, last_watched_at")
      .in("enrollment_id", enrollmentIds);
    allProgress = (progress ?? []) as typeof allProgress;
  }

  const lessonsByModule = new Map<string, string[]>();
  for (const l of lessons ?? []) {
    if (!l.mux_playback_id) continue;
    const list = lessonsByModule.get(l.module_id) ?? [];
    list.push(l.id);
    lessonsByModule.set(l.module_id, list);
  }

  const students: CohortStudentProgress[] = enrollments.map((enr) => {
    const profile = enr.profiles as { full_name: string | null; email: string } | null;
    const name = profile?.full_name ?? profile?.email ?? "Alumno";
    const initials = name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    const studentProgress = allProgress.filter(
      (p) => p.enrollment_id === enr.id,
    );

    const moduleProgress = modules.map((mod) => {
      const modLessons = lessonsByModule.get(mod.id) ?? [];
      const completedLessons = modLessons.filter((lid) =>
        studentProgress.some((p) => p.lesson_id === lid && p.completed),
      ).length;
      const total = modLessons.length;
      return {
        module_id: mod.id,
        module_title: mod.title,
        module_position: mod.position,
        total_lessons: total,
        completed_lessons: completedLessons,
        percentage: total > 0 ? Math.round((completedLessons / total) * 100) : 0,
      };
    });

    const overall =
      moduleProgress.length > 0
        ? Math.round(
            moduleProgress.reduce((s, m) => s + m.percentage, 0) /
              moduleProgress.length,
          )
        : 0;

    const lastWatched = studentProgress
      .map((p) => p.last_watched_at)
      .filter(Boolean)
      .sort()
      .reverse()[0];

    return {
      student_id: enr.student_id,
      full_name: name,
      email: profile?.email ?? "",
      initials,
      enrollment_id: enr.id,
      module_progress: moduleProgress,
      overall_percentage: overall,
      last_seen: lastWatched ?? null,
    };
  });

  students.sort((a, b) => b.overall_percentage - a.overall_percentage);

  return { cohort, program, modules, students };
}
