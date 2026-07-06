-- =============================================================================
-- Capital Academy — Bitácora de seguimiento post-clase del Ciclo de Capacitación
-- Comercial CI (correo "grabación disponible" + CTA a programa pago).
--
-- Contexto: cuando el webhook de Mux publica la grabación de una sesión del
-- ciclo CAP-CI (class_sessions.lesson_id → lección recorded), se envía el
-- follow-up (sendCapacitacionFollowupEmail) a los inscritos activos de la
-- cohorte. Este correo se envía UNA sola vez por sesión.
--
-- ¿Por qué una tabla nueva y no reusar session_reminders?
-- session_reminders tiene un CHECK `kind in ('24h','1h')` (ver 0026), así que
-- NO admite un kind='followup' sin alterar ese constraint. Para no tocar el
-- esquema del cron de recordatorios (otro flujo en producción), se usa una
-- tabla propia y mínima: session_id como PK garantiza la idempotencia (el
-- webhook reserva la fila ANTES de enviar; un segundo evento choca con la PK).
--
-- RLS: solo staff de plataforma lee. El webhook escribe con service_role, que
-- bypassa RLS por diseño (igual que session_reminders). Helper: is_platform_staff().
--
-- TODO ADITIVO · idempotente · reversible (no borra columnas ni datos).
-- =============================================================================

create table if not exists public.capacitacion_followup_log (
  session_id uuid primary key
    references public.class_sessions(id) on delete cascade,
  recipients_count int not null default 0,
  sent_at timestamptz not null default now()
);

alter table public.capacitacion_followup_log enable row level security;

drop policy if exists capacitacion_followup_log_staff_select
  on public.capacitacion_followup_log;
create policy capacitacion_followup_log_staff_select
  on public.capacitacion_followup_log
  for select using (public.is_platform_staff());

-- No se definen políticas de insert/update/delete: el webhook usa service_role
-- (bypassa RLS) y ningún cliente con RLS debe poder escribir esta bitácora.
