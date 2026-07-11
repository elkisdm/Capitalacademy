-- =============================================================================
-- Capital Academy — Cierra el gap de reintento en el patrón "reserva-antes-de-
-- enviar" de las notificaciones "grabación disponible" del webhook de Mux
-- (genérico sobre lessons, ver 0062; y CAP-CI sobre capacitacion_followup_log,
-- ver 0051). Mismo fix dos-fases que 0063 aplicó a los crons.
--
-- Problema: la reserva marcaba la notificación como enviada ANTES de enviar de
-- verdad. Si el webhook expira o crashea entre la reserva y el fin del loop, la
-- cohorte queda marcada como notificada y pierde el correo para siempre. Mux NO
-- reintenta (200 siempre + anti-replay 5min).
--
-- Fix: columna "completado" separada de la "reserva". El código marca completado
-- SOLO tras terminar el loop; el reclamo atómico (lib/classroom/recording-
-- notifications.ts) trata las reservas viejas sin completar como reintentables.
--
-- ADITIVO · idempotente · reversible (no borra columnas ni datos).
-- =============================================================================

alter table public.lessons
  add column if not exists recording_notify_completed_at timestamptz;

alter table public.capacitacion_followup_log
  add column if not exists completed_at timestamptz;

-- Backfill OBLIGATORIO: toda notificación ya enviada ANTES de esta migración
-- debe quedar marcada como completada, si no el cron de reconciliación las vería
-- como crash y REENVIARÍA a cohortes ya notificadas (hay grabaciones históricas
-- en prod: Diplomado G4, Liderazgo, CAP-CI).
update public.lessons
  set recording_notify_completed_at = recording_notified_at
  where recording_notified_at is not null
    and recording_notify_completed_at is null;

update public.capacitacion_followup_log
  set completed_at = sent_at
  where completed_at is null;

-- Índices parciales para el scan del cron (diminutos: solo reservas en curso o crasheadas).
create index if not exists lessons_recording_notify_pending_idx
  on public.lessons(recording_notified_at)
  where recording_notified_at is not null and recording_notify_completed_at is null;

create index if not exists capacitacion_followup_pending_idx
  on public.capacitacion_followup_log(sent_at)
  where completed_at is null;
