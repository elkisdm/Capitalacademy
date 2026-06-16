-- =============================================================================
-- Capital Academy — Recordatorios de sesión (alertas antes de cada clase).
--
-- ADR: docs/adr/0008-entorno-diplomado-y-calendario-de-sesiones.md
-- Brief: docs/briefs/fase2-calendario-y-segmentacion-diplomado.md (2c)
--
-- Crea public.session_reminders: bitácora de envíos de recordatorio por sesión.
-- Sirve para IDEMPOTENCIA: el cron consulta esta tabla antes de enviar y la
-- escritura con unique(session_id, kind, channel) impide duplicados aun con
-- ejecuciones solapadas del scheduler (carrera de dos invocaciones del cron).
--
-- channel: 'email' (hoy) | 'whatsapp' (stub futuro).
-- kind:    '24h' | '1h' (ventana de antelación respecto a starts_at).
-- status:  'sent' | 'skipped' | 'failed' (auditoría; el unique reserva el slot
--          en cualquier estado terminal para no reintentar al infinito).
--
-- RLS: SOLO staff de plataforma lee. El cron escribe con service_role, que
-- bypassa RLS por diseño; NO se abre política de escritura por RLS.
-- Helpers RLS de migración 0007: public.is_platform_staff().
--
-- Idempotente: create ... if not exists, drop policy if exists antes de create.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 0. Tipos
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'reminder_status') then
    create type reminder_status as enum ('sent', 'skipped', 'failed');
  end if;
end$$;

-- ----------------------------------------------------------------------------
-- 1. Tabla
-- ----------------------------------------------------------------------------
create table if not exists public.session_reminders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  channel text not null default 'email',
  kind text not null,
  status reminder_status not null default 'sent',
  recipients_count int not null default 0,
  error text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Idempotencia: un único registro por (sesión, ventana, canal).
  constraint session_reminders_unique unique (session_id, kind, channel),
  constraint session_reminders_channel_chk check (channel in ('email', 'whatsapp')),
  constraint session_reminders_kind_chk check (kind in ('24h', '1h'))
);

create index if not exists session_reminders_session_idx
  on public.session_reminders(session_id);

-- ----------------------------------------------------------------------------
-- 2. RLS — solo lectura para staff; escritura solo por service_role (bypass).
-- ----------------------------------------------------------------------------
alter table public.session_reminders enable row level security;

drop policy if exists session_reminders_staff_select on public.session_reminders;
create policy session_reminders_staff_select on public.session_reminders
  for select using (public.is_platform_staff());

-- No se definen políticas de insert/update/delete: el cron usa service_role
-- (bypassa RLS) y ningún cliente con RLS debe poder escribir esta bitácora.