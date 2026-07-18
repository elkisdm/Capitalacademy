-- =============================================================================
-- Capital Academy — Estado de matrícula por pago (auditoría global 2026-07-17, A1).
-- Un pago Flow succeeded cuya matrícula (enrollBuyer) falla quedaba huérfano
-- permanente y silencioso: paid_at ya no es null → firstSuccess no re-dispara,
-- y el cron flow-reconcile solo mira status='pending'. Misma clase del incidente
-- de $783.400 (3 pagos de mayo). Ver ADR-0023.
--
-- BACKFILL (crítico): sin él, TODOS los succeeded históricos quedarían 'pending'
-- y el reconcile re-invocaría enrollBuyer para todos → reenvío masivo de
-- onboarding. Marcamos los succeeded existentes como terminales:
--   - plan matriculable  → 'enrolled' (ya procesados por el código viejo).
--   - plan null (cobro genérico) → 'not_applicable'.
-- El default 'pending' es correcto solo para pagos FUTUROS. Backfill guardado
-- por `enrollment_status = 'pending'` para ser re-ejecutable.
--
-- Idempotente: add column if not exists; add constraint / create index if not
-- exists; backfill guardado por el default.
-- =============================================================================

alter table public.payments
  add column if not exists enrollment_status text not null default 'pending',
  add column if not exists enrolled_at timestamptz,
  add column if not exists enrollment_attempts integer not null default 0,
  add column if not exists enrollment_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_enrollment_status_ck'
  ) then
    alter table public.payments
      add constraint payments_enrollment_status_ck
        check (enrollment_status in ('not_applicable', 'pending', 'enrolled', 'failed'));
  end if;
end $$;

update public.payments
  set enrollment_status = 'enrolled',
      enrolled_at = paid_at
  where enrollment_status = 'pending'
    and status = 'succeeded'
    and plan in ('contado','webpay-6','webpay-12','lid-contado','lid-46','lid-712');

update public.payments
  set enrollment_status = 'not_applicable'
  where enrollment_status = 'pending'
    and status = 'succeeded'
    and (plan is null
      or plan not in ('contado','webpay-6','webpay-12','lid-contado','lid-46','lid-712'));

create index if not exists payments_enrollment_unresolved_idx
  on public.payments (enrollment_attempts, paid_at)
  where status = 'succeeded'
    and enrollment_status in ('pending', 'failed');
