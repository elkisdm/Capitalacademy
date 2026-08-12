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
  // (resolveResourceUrls) la reemplaza por una signed URL (con &download=) antes
  // de renderizar.
  url: string | null;
  // Signed URL SIN forzar descarga, para el visor in-app (null en links externos
  // o si aún no se resolvió). Opcional: filas crudas de Supabase no la traen.
  viewUrl?: string | null;
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

// --- Tipo de actividad (tipificación de lecciones, migración 0071) ----------
// Ortogonal a `lessons.kind` (modalidad: presencial/online/grabada). Solo TRES
// valores (ver ADR-0017): 'integration' NO es un tipo aparte, queda dentro de
// 'practice' (taxonomía final de la profe: "es clase, es actividad práctica o
// es evaluación").
export type LessonActivityType = "class" | "practice" | "evaluation";

export const ACTIVITY_OPTIONS: { value: LessonActivityType; label: string }[] = [
  { value: "class", label: "Clase" },
  { value: "practice", label: "Actividad práctica" },
  { value: "evaluation", label: "Evaluación" },
];

/** Label + tono de badge por tipo de actividad. 'class' no lleva badge (90% de
 *  las filas): marcarlo sería ruido, justo el desorden que la profe pidió
 *  eliminar. */
export const ACTIVITY_TYPE_LABELS: Record<
  LessonActivityType,
  { label: string; tone: "amber" | "lime" } | null
> = {
  class: null,
  practice: { label: "Actividad práctica", tone: "amber" },
  evaluation: { label: "Evaluación", tone: "lime" },
};

export const COMPLETION_THRESHOLD = 90;

// --- Calendario de sesiones (clases en vivo) ---------------------------------
// `title` y `teacher_id` se agregan en la migración 0022; `audience` en la 0024;
// `cover_image_url` en la 0096. Hasta regenerar los tipos de Supabase
// (`supabase gen types`) no están en Tables<"class_sessions">, por eso se
// declaran aquí explícitamente.
export type SessionAudience = "all" | "capital_inteligente";

export type ClassSession = Tables<"class_sessions"> & {
  title: string | null;
  teacher_id: string | null;
  audience: SessionAudience;
  cover_image_url: string | null;
};

export type SessionInstructor = {
  id: string;
  /** Slug legible para la URL del docente (0090). */
  slug?: string | null;
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
  // por una signed URL (con &download=) antes de renderizar.
  url: string | null;
  // Signed URL SIN forzar descarga, para el visor in-app (null en links externos
  // o si aún no se resolvió). Opcional: filas crudas de Supabase no la traen.
  viewUrl?: string | null;
  storage_path: string | null;
  position: number;
};

/** Referencia mínima al quiz activo de una clase en vivo (scope='session'). */
export type SessionEvaluationRef = { id: string; title: string; slug?: string | null };

export type ScheduleSession = ClassSession & {
  teacher: SessionInstructor | null;
  resources: SessionResource[];
  evaluation: SessionEvaluationRef | null;
};

export type SessionTiming = "past" | "live" | "upcoming";
