-- 0081_session_reminders_72h.sql
--
-- Agrega la ventana de recordatorio de 72h (3 días antes) a los recordatorios de
-- clase. Hasta ahora el cron solo tenía '24h' y '1h' (ver 0026 y 0075); el CHECK
-- de ambas tablas rechazaba cualquier otro valor, así que ampliarlo es requisito
-- para que `app/api/cron/session-reminders/route.ts` pueda reservar la fila.
--
-- No hay backfill: las sesiones que ya están a menos de 72h simplemente no
-- reciben este recordatorio (el cron solo mira hacia adelante).

alter table public.session_reminders
  drop constraint if exists session_reminders_kind_chk;

alter table public.session_reminders
  add constraint session_reminders_kind_chk
  check (kind = any (array['72h'::text, '24h'::text, '1h'::text]));

alter table public.session_reminder_recipients
  drop constraint if exists session_reminder_recipients_kind_chk;

alter table public.session_reminder_recipients
  add constraint session_reminder_recipients_kind_chk
  check (kind = any (array['72h'::text, '24h'::text, '1h'::text]));
