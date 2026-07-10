-- =============================================================================
-- Capital Academy — Bitácora de alertas de inasistencia (correo de advertencia
-- al llegar a 2 clases en vivo no registradas).
--
-- ADR: docs/adr/0013-alerta-inasistencias-y-expiracion-qr.md
--
-- Contexto: el cron existente `session-reminders` (cada 30 min) agrega un pase
-- que cuenta inasistencias por alumno+cohorte y envía un correo cordial al
-- alcanzar el umbral. Esta tabla es la bitácora de IDEMPOTENCIA de ese correo:
-- unique (student_id, cohort_id, kind) garantiza un solo envío por alumno y
-- cohorte para un mismo tipo de alerta, aun con ejecuciones solapadas del
-- scheduler (mismo patrón reserva-antes-de-enviar de session_reminders, 0026).
--
-- NO se agrega ninguna columna de hora de término: class_sessions.ends_at ya
-- es timestamptz not null desde la migración base (0001_init_core.sql:117).
-- La ventana de asistencia (lib/asistencia/window.ts) y el conteo de
-- inasistencias (lib/asistencia/queries.ts) se derivan de esa columna.
--
-- RLS: SOLO staff de plataforma lee. El cron escribe con service_role, que
-- bypassa RLS por diseño; NO se abre política de escritura por RLS.
-- Helper de RLS de migración 0007: public.is_platform_staff().
--
-- Idempotente: create table if not exists + drop policy if exists antes de
-- create policy.
-- =============================================================================

create table if not exists public.attendance_alerts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  kind text not null default 'absence_2',
  absences_count int not null default 0,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  sent_at timestamptz not null default now(),
  -- Idempotencia: un único registro por (alumno, cohorte, tipo de alerta).
  constraint attendance_alerts_unique unique (student_id, cohort_id, kind)
);

create index if not exists attendance_alerts_cohort_idx
  on public.attendance_alerts(cohort_id);

-- ----------------------------------------------------------------------------
-- RLS — solo lectura para staff; escritura solo por service_role (bypass).
-- ----------------------------------------------------------------------------
alter table public.attendance_alerts enable row level security;

drop policy if exists attendance_alerts_staff_select on public.attendance_alerts;
create policy attendance_alerts_staff_select on public.attendance_alerts
  for select using (public.is_platform_staff());

-- No se definen políticas de insert/update/delete: el cron usa service_role
-- (bypassa RLS) y ningún cliente con RLS debe poder escribir esta bitácora.
