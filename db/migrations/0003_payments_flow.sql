-- =============================================================================
-- Capital Academy — Soporte multi-proveedor de pagos (Fintoc + Flow).
-- Agrega columnas para Flow.cl y un discriminador del proveedor usado.
-- Las columnas fintoc_* se mantienen por compatibilidad (proveedor actual
-- queda detrás de feature flag PAYMENT_PROVIDER).
-- =============================================================================

alter table public.payments
  add column if not exists provider text not null default 'flow'
    check (provider in ('fintoc', 'flow')),
  add column if not exists flow_token text unique,
  add column if not exists flow_order bigint unique,
  add column if not exists commerce_order text unique;

create index if not exists payments_flow_token_idx
  on public.payments(flow_token);
create index if not exists payments_commerce_order_idx
  on public.payments(commerce_order);
