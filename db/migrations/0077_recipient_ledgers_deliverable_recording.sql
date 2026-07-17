-- =============================================================================
-- Capital Academy — Idempotencia POR DESTINATARIO de las dos familias de correos
-- transaccionales que aún hacían fan-out secuencial sin bitácora (auditoría
-- global 2026-07-17, A2 + M1). Espeja 0075 (session_reminder_recipients).
--
-- Familia 1 — apertura de entregable (lib/deliverables/notify.ts): marcaba
--   open_notify_completed_at incondicionalmente; un fallo de Resend a un
--   destinatario perdía ese correo para siempre y un timeout re-recorría a todos.
-- Familia 2 — grabación disponible / seguimiento CAP-CI
--   (lib/classroom/recording-notifications.ts): mismo doble modo de falla.
--
-- Fix: bitácora por destinatario. El emisor consulta a quién le FALTA y solo
-- envía a esos vía sendEmailBatch; marca *_completed_at SOLO si cero fallos.
--
-- RLS: solo staff lee (is_platform_staff). El cron/webhook escribe con
-- service_role (bypassa RLS): NO se abren políticas de escritura. Mismo criterio
-- que session_reminder_recipients (0075) y capacitacion_followup_log (0051).
--
-- Sin backfill: son tablas nuevas y solo importan para objetos EN VUELO; los
-- objetos ya completados son terminales (los crons filtran *_completed_at null)
-- y jamás vuelven a leer la bitácora.
--
-- Idempotente: create table if not exists, drop policy if exists antes de create.
-- =============================================================================

-- Familia 1: apertura de entregable (program-scoped → clave deliverable_id).
create table if not exists public.deliverable_open_recipients (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null default 'email',
  kind text not null default 'deliverable_open',
  status text not null default 'sent',
  error text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint deliverable_open_recipients_unique
    unique (deliverable_id, kind, channel, student_id),
  constraint deliverable_open_recipients_channel_chk
    check (channel in ('email')),
  constraint deliverable_open_recipients_kind_chk
    check (kind in ('deliverable_open')),
  constraint deliverable_open_recipients_status_chk
    check (status in ('sent', 'failed'))
);

create index if not exists deliverable_open_recipients_lookup_idx
  on public.deliverable_open_recipients(deliverable_id, kind, channel);

alter table public.deliverable_open_recipients enable row level security;

drop policy if exists deliverable_open_recipients_staff_select
  on public.deliverable_open_recipients;
create policy deliverable_open_recipients_staff_select
  on public.deliverable_open_recipients
  for select using (public.is_platform_staff());

-- Familia 2: grabación disponible (genérica) + seguimiento CAP-CI. Ambas son
-- sobre la grabación de una class_sessions → clave session_id, kind discrimina.
create table if not exists public.recording_notify_recipients (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null default 'email',
  kind text not null,
  status text not null default 'sent',
  error text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint recording_notify_recipients_unique
    unique (session_id, kind, channel, student_id),
  constraint recording_notify_recipients_channel_chk
    check (channel in ('email')),
  constraint recording_notify_recipients_kind_chk
    check (kind in ('recording_available', 'capacitacion_followup')),
  constraint recording_notify_recipients_status_chk
    check (status in ('sent', 'failed'))
);

create index if not exists recording_notify_recipients_lookup_idx
  on public.recording_notify_recipients(session_id, kind, channel);

alter table public.recording_notify_recipients enable row level security;

drop policy if exists recording_notify_recipients_staff_select
  on public.recording_notify_recipients;
create policy recording_notify_recipients_staff_select
  on public.recording_notify_recipients
  for select using (public.is_platform_staff());

-- Ninguna define políticas de insert/update/delete: escritura solo por service_role.
