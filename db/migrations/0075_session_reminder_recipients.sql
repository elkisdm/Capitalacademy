-- =============================================================================
-- Capital Academy — Idempotencia POR DESTINATARIO de los recordatorios de clase.
--
-- Problema (megaauditoría 2026-07-16, C4): session_reminders (0026) da
-- idempotencia por (session_id, kind, channel) — por SESIÓN, no por
-- destinatario. El fan-out del cron es un loop secuencial sin throttle: si la
-- corrida muere a mitad, la fila vuelve a 'pending', el reclamo la retoma y
-- reenvía DESDE EL DESTINATARIO 1. Con 239 matrículas activas en CAP-CI
-- (cohorte b0000000-…-004) eso son 5-7 correos repetidos a los primeros.
--
-- Evidencia en prod al 2026-07-16: de las 5 corridas históricas (24
-- destinatarios), 4 quedaron con un 429 de Resend guardado en `error` y
-- recipients_count 20-23 → la fila igual se marcó 'sent' (estado terminal) y
-- esos ~10 correos NUNCA se reintentaron. El bug ya cuesta correos a 24
-- destinatarios; a 239 es masivo.
--
-- Fix: bitácora por destinatario. El cron la consulta para calcular a quién le
-- FALTA el correo y solo envía a esos, así un reintento es quirúrgico y la
-- fila de session_reminders puede marcarse 'failed' (reintentable) sin que eso
-- implique reenviar a quien ya recibió.
--
-- RLS: solo staff lee. El cron escribe con service_role (bypassa RLS), mismo
-- criterio que session_reminders (0026) y attendance_alerts (0054): NO se
-- abren políticas de escritura.
--
-- Idempotente: create ... if not exists, drop policy if exists antes de create.
-- =============================================================================

create table if not exists public.session_reminder_recipients (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null default 'email',
  kind text not null,
  status text not null default 'sent',
  error text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Idempotencia: un único registro por (sesión, ventana, canal, destinatario).
  constraint session_reminder_recipients_unique
    unique (session_id, kind, channel, student_id),
  constraint session_reminder_recipients_channel_chk
    check (channel in ('email', 'whatsapp')),
  constraint session_reminder_recipients_kind_chk
    check (kind in ('24h', '1h')),
  constraint session_reminder_recipients_status_chk
    check (status in ('sent', 'failed'))
);

-- El cron busca por (session_id, kind, channel) en cada corrida.
create index if not exists session_reminder_recipients_lookup_idx
  on public.session_reminder_recipients(session_id, kind, channel);

alter table public.session_reminder_recipients enable row level security;

drop policy if exists session_reminder_recipients_staff_select
  on public.session_reminder_recipients;
create policy session_reminder_recipients_staff_select
  on public.session_reminder_recipients
  for select using (public.is_platform_staff());

-- No se definen políticas de insert/update/delete: el cron usa service_role.
