import type { Tables } from "@/lib/supabase/types";

export type Lesson = Tables<"lessons"> & {
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  mux_upload_id: string | null;
  video_duration_seconds: number | null;
  thumbnail_url: string | null;
};

export type VideoProgress = {
  id: string;
  enrollment_id: string;
  lesson_id: string;
  playback_position_seconds: number;
  duration_seconds: number;
  max_position_seconds: number;
  watch_percentage: number;
  completed: boolean;
  completed_at: string | null;
  source: "player" | "manual" | "system";
  last_watched_at: string;
  created_at: string;
};

export type LessonResource = {
  id: string;
  lesson_id: string;
  title: string;
  type: "pdf" | "link" | "template" | "document" | "other";
  url: string;
  storage_path: string | null;
  file_size_bytes: number | null;
  position: number;
  created_by: string | null;
  created_at: string;
};

export type LessonWithProgress = Lesson & {
  video_progress: VideoProgress | null;
  resources: LessonResource[];
};

export type ModuleWithLessons = Tables<"program_modules"> & {
  lessons: LessonWithProgress[];
  teacher: { full_name: string | null } | null;
};

export type ModuleProgress = {
  module_id: string;
  total_lessons: number;
  completed_lessons: number;
  total_with_video: number;
  percentage: number;
};

export type LessonStatus = "locked" | "available" | "in_progress" | "completed" | "no_video";

export const COMPLETION_THRESHOLD = 90;
