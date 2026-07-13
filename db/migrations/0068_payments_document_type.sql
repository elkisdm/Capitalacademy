-- =============================================================================
-- Capital Academy — Tipo de documento tributario y datos de facturación.
-- Boleta (default, comportamiento actual) o factura. Cuando es factura se
-- guardan los datos de la empresa en invoice_data (jsonb) para que el equipo
-- la emita a mano. Los pagos existentes quedan como 'boleta' por el default,
-- sin backfill.
-- =============================================================================

alter table public.payments
  add column if not exists document_type text not null default 'boleta'
    check (document_type in ('boleta', 'factura')),
  add column if not exists invoice_data jsonb;

-- invoice_data solo tiene sentido cuando es factura; boleta debe quedar en null.
alter table public.payments
  add constraint payments_invoice_data_ck
    check (document_type = 'factura' or invoice_data is null);

create index if not exists payments_document_type_idx
  on public.payments(document_type);
