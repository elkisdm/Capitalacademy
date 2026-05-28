-- Performance indexes for frequently-queried columns
-- Identified via architecture audit 2026-05-27

-- Enrollment status filtering (used in every dashboard query)
CREATE INDEX IF NOT EXISTS enrollments_status_idx
  ON public.enrollments(status);

-- Active enrollments per cohort (most common query pattern)
CREATE INDEX IF NOT EXISTS enrollments_cohort_active_idx
  ON public.enrollments(cohort_id, status)
  WHERE status = 'active';

-- Lessons ordered by position within module
CREATE INDEX IF NOT EXISTS lessons_module_position_idx
  ON public.lessons(module_id, position);

-- Incomplete video progress (used in progress dashboards)
CREATE INDEX IF NOT EXISTS video_progress_incomplete_idx
  ON public.video_progress(lesson_id, completed)
  WHERE completed = false;
