-- Data consistency constraints
-- Identified via architecture audit 2026-05-27

-- Ensure completed video progress has a timestamp and reasonable watch percentage
ALTER TABLE public.video_progress
  ADD CONSTRAINT chk_video_completed_consistency CHECK (
    (completed = false)
    OR
    (completed = true AND completed_at IS NOT NULL)
  );

-- Ensure quiz attempts have score when completed
ALTER TABLE public.quiz_attempts
  ADD CONSTRAINT chk_quiz_attempt_completed CHECK (
    (completed_at IS NULL)
    OR
    (completed_at IS NOT NULL AND score_pct IS NOT NULL AND passed IS NOT NULL)
  );
