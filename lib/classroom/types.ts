import type { Tables } from "@/lib/supabase/types";

export type Lesson = Tables<"lessons"> & {
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  mux_upload_id: string | null;
  video_duration_seconds: number | null;
  thumbnail_url: string | null;
  cover_image_url: string | null;
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
  // null cuando el recurso es un archivo subido todavía sin firmar; el resolver
  // (resolveResourceUrls) la reemplaza por una signed URL antes de renderizar.
  url: string | null;
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
  cover_image_url: string | null;
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

// --- Calendario de sesiones (clases en vivo) ---------------------------------
// `title` y `teacher_id` se agregan en la migración 0022; `audience` en la 0024.
// Hasta regenerar los tipos de Supabase (`supabase gen types`) no están en
// Tables<"class_sessions">, por eso se declaran aquí explícitamente.
export type SessionAudience = "all" | "capital_inteligente";

export type ClassSession = Tables<"class_sessions"> & {
  title: string | null;
  teacher_id: string | null;
  audience: SessionAudience;
};

export type SessionInstructor = {
  id: string;
  full_name: string;
  photo_url: string | null;
};

export type SessionResourceType = "pdf" | "link" | "template" | "document" | "other";

export type SessionResource = {
  id: string;
  session_id: string;
  title: string;
  type: SessionResourceType;
  // null si es un archivo subido sin firmar; resolveResourceUrls la reemplaza
  // por una signed URL antes de renderizar.
  url: string | null;
  storage_path: string | null;
  position: number;
};

/** Referencia mínima al quiz activo de una clase en vivo (scope='session'). */
export type SessionEvaluationRef = { id: string; title: string };

export type ScheduleSession = ClassSession & {
  teacher: SessionInstructor | null;
  resources: SessionResource[];
  evaluation: SessionEvaluationRef | null;
};

export type SessionTiming = "past" | "live" | "upcoming";
