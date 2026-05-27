import type {
  LessonWithProgress,
  ModuleProgress,
  LessonStatus,
  Lesson,
} from "./types";
import { COMPLETION_THRESHOLD } from "./types";

export function calculateModuleProgress(
  lessons: LessonWithProgress[],
): ModuleProgress {
  const withVideo = lessons.filter((l) => l.mux_playback_id);
  const completed = withVideo.filter(
    (l) => l.video_progress?.completed === true,
  );
  const totalWithVideo = withVideo.length;
  const totalLessons = lessons.length;

  return {
    module_id: lessons[0]?.module_id ?? "",
    total_lessons: totalLessons,
    completed_lessons: completed.length,
    total_with_video: totalWithVideo,
    percentage: totalLessons === 0 ? 0 : Math.round((completed.length / totalLessons) * 100),
  };
}

export function getLessonStatus(lesson: LessonWithProgress): LessonStatus {
  if (lesson.unlock_at && new Date(lesson.unlock_at) > new Date()) {
    return "locked";
  }

  if (!lesson.mux_playback_id) {
    return "no_video";
  }

  if (lesson.video_progress?.completed) {
    return "completed";
  }

  if (
    lesson.video_progress &&
    lesson.video_progress.watch_percentage > 0
  ) {
    return "in_progress";
  }

  return "available";
}

export function computeServerProgress(
  current: { max_position_seconds: number } | null,
  incoming: { playback_position_seconds: number; duration_seconds: number },
) {
  const maxPosition = Math.max(
    current?.max_position_seconds ?? 0,
    incoming.playback_position_seconds,
  );
  const watchPercentage =
    incoming.duration_seconds > 0
      ? Math.min((maxPosition / incoming.duration_seconds) * 100, 100)
      : 0;
  const completed = watchPercentage >= COMPLETION_THRESHOLD;

  return {
    playback_position_seconds: incoming.playback_position_seconds,
    duration_seconds: incoming.duration_seconds,
    max_position_seconds: maxPosition,
    watch_percentage: Math.round(watchPercentage * 100) / 100,
    completed,
    last_watched_at: new Date().toISOString(),
  };
}
