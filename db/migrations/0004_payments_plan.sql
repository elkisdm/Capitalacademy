-- =============================================================================
-- Capital Academy — Plan de pago elegido por el alumno.
-- Persiste el plan ("contado" | "webpay-6" | "webpay-12") para reconciliación
-- contable, soporte y personalización del email de confirmación. Los pagos
-- previos a esta migración quedan en NULL (se asumen contado por convención
-- histórica, pero no se backfillea para evitar reescribir datos crudos).
-- =============================================================================

alter table public.payments
  add column if not exists plan text
    check (plan in ('contado', 'webpay-6', 'webpay-12'));

create index if not exists payments_plan_idx on public.payments(plan);
