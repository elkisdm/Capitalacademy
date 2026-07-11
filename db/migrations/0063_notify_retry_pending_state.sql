-- =============================================================================
-- Capital Academy — Cierra el GAP de reintento en el patrón "reserva-antes-de-
-- enviar" de los crons de correo (session_reminders, attendance_alerts,
-- deliverables).
--
-- Problema: la reserva marcaba la fila como TERMINAL ('sent') antes de enviar
-- de verdad. Si el proceso moría entre la reserva y el envío/update final, la
-- fila quedaba en un estado indistinguible de "enviado con éxito" y el filtro
-- de idempotencia (que solo excluye 'failed') nunca la reintentaba: el correo
-- se perdía para siempre.
--
-- Fix: se agrega el estado 'pending' — representa "reservado, envío en
-- curso" — distinto de los estados terminales ('sent', 'skipped', 'failed').
-- El código de app/api/cron/session-reminders/route.ts reclama de forma
-- atómica (update condicional) las filas 'failed' (reintentables de
-- inmediato) y las 'pending' VIEJAS (reservadas hace más de
-- RETRY_STALE_MS y nunca resueltas: señal de crash a mitad de camino). Una
-- fila 'pending' reciente se deja en paz: puede ser una corrida concurrente
-- todavía en curso.
--
-- deliverables usa columnas propias (no un enum de status): se agrega
-- `open_notify_completed_at` para distinguir "reservado" (open_notified_at)
-- de "envío terminado" (open_notify_completed_at). Mismo criterio de reclamo
-- atómico vía update condicional en lib/deliverables/notify.ts.
--
-- Idempotente: ADD VALUE IF NOT EXISTS / add column if not exists / constraint
-- se recrea con drop if exists + add.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. session_reminders: nuevo valor de enum 'pending'.
--    ALTER TYPE ... ADD VALUE se ejecuta como sentencia suelta (no dentro de
--    un bloque DO/PL-pgSQL) porque Postgres no permite añadir valores de enum
--    dentro de una subtransacción; IF NOT EXISTS la hace idempotente sin DO.
-- ----------------------------------------------------------------------------
alter type reminder_status add value if not exists 'pending';

-- ----------------------------------------------------------------------------
-- 2. attendance_alerts: el check de status es texto plano, no enum.
-- ----------------------------------------------------------------------------
alter table public.attendance_alerts drop constraint if exists attendance_alerts_status_check;
alter table public.attendance_alerts add constraint attendance_alerts_status_check
  check (status in ('sent', 'failed', 'pending'));

-- ----------------------------------------------------------------------------
-- 3. deliverables: bandera de "envío terminado", separada de la reserva.
--    El cron de aperturas (app/api/cron/deliverable-openings/route.ts) pasa a
--    filtrar por esta columna en vez de open_notified_at, así que se
--    reemplaza el índice parcial de 0053 (open_notified_at is null) por uno
--    equivalente sobre open_notify_completed_at.
-- ----------------------------------------------------------------------------
alter table public.deliverables add column if not exists open_notify_completed_at timestamptz;

drop index if exists public.deliverables_pending_notify_idx;
create index if not exists deliverables_pending_notify_idx on public.deliverables(opens_at)
  where open_notify_completed_at is null;
