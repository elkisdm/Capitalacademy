-- =============================================================================
-- Capital Academy — Ampliar planes aceptados en payments.plan para el
-- Programa de Liderazgo y Gestión de Equipos Comerciales.
--
-- El constraint original (0004) solo aceptaba los planes del Diplomado. El
-- nuevo programa usa sus propias claves de cuotas (lid-contado / lid-46 /
-- lid-712). Se reemplaza el CHECK para incluirlas. NULL sigue permitido
-- (cobros genéricos) porque un CHECK con NULL evalúa a UNKNOWN y pasa.
-- =============================================================================

alter table public.payments
  drop constraint if exists payments_plan_check;

alter table public.payments
  add constraint payments_plan_check
    check (plan in (
      'contado', 'webpay-6', 'webpay-12',
      'lid-contado', 'lid-46', 'lid-712'
    ));
