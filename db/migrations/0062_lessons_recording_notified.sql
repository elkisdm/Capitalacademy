-- =============================================================================
-- Capital Academy — Idempotencia de la notificación "grabación disponible"
-- para todos los programas salvo CAP-CI (que ya usa capacitacion_followup_log,
-- ver 0051).
--
-- Contexto: al publicarse la grabación de una clase en vivo (lección
-- 'recorded' enlazada vía class_sessions.lesson_id), se avisa por correo a los
-- inscritos activos de la cohorte (sendRecordingAvailableEmail). Esta columna
-- marca cuándo se envió esa notificación para que el webhook de Mux (que Mux
-- puede reintentar) no la reenvíe.
--
-- ADITIVO · idempotente · reversible (no borra columnas ni datos).
-- =============================================================================

alter table public.lessons
  add column if not exists recording_notified_at timestamptz;
