-- =============================================================================
-- Capital Academy — Pagos de ingreso al diplomado (Fintoc)
-- Registra cada intento de pago y su estado final reportado por webhook.
-- =============================================================================

create type payment_status as enum (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'refunded'
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),

  -- Datos del pagador (capturados antes de crear la sesión Fintoc)
  firstname text not null,
  lastname text not null,
  rut text not null,
  email text not null,
  phone text not null,

  -- Monto en CLP, sin decimales (Fintoc trabaja en unidad mínima)
  amount_clp integer not null check (amount_clp > 0),
  currency text not null default 'CLP',

  -- Identificadores Fintoc
  fintoc_session_id text unique,
  fintoc_payment_id text unique,

  status payment_status not null default 'pending',
  failure_reason text,

  -- Trazabilidad
  raw_webhook jsonb,
  ip_address inet,
  user_agent text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index payments_email_idx on public.payments(email);
create index payments_rut_idx on public.payments(rut);
create index payments_status_idx on public.payments(status);
create index payments_fintoc_session_idx on public.payments(fintoc_session_id);

create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.tg_set_updated_at();

-- RLS: solo service_role puede leer/escribir. La tabla NO se expone al cliente.
alter table public.payments enable row level security;
