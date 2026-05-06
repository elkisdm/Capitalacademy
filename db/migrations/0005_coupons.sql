-- =============================================================================
-- Capital Academy — Cupones de descuento.
-- Cupones con código único que aplican un descuento porcentual sobre el monto
-- final del plan elegido. Se valida en /api/pago/cupon y se aplica en
-- /api/pago/checkout. Cada uso queda persistido en payments para auditoría.
-- =============================================================================

create table public.coupons (
  id uuid primary key default gen_random_uuid(),

  -- Código que tipea el alumno. Guardado en mayúsculas para comparación
  -- case-insensitive desde la app (la app normaliza con .toUpperCase()).
  code text not null unique,

  -- Descuento porcentual entero (50 = 50%). Se mantiene como % para que
  -- aplique de forma proporcional al plan (contado o cuotas) sin recalcular
  -- recargos.
  percent_off integer not null check (percent_off > 0 and percent_off <= 100),

  -- Etiqueta interna para identificar la campaña. No se muestra al usuario.
  label text,

  -- Ventana de validez. NULL = sin límite.
  valid_from timestamptz,
  valid_until timestamptz,

  -- Cupos: NULL = ilimitado. redemptions se incrementa al confirmarse el pago.
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemptions integer not null default 0 check (redemptions >= 0),

  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index coupons_code_idx on public.coupons(code);
create index coupons_active_idx on public.coupons(active);

create trigger trg_coupons_updated_at
  before update on public.coupons
  for each row execute function public.tg_set_updated_at();

-- RLS: solo service_role. La validación pasa por el endpoint server-side.
alter table public.coupons enable row level security;

-- Vincular cupón usado al pago, junto con el descuento real aplicado.
-- Guardamos amount_clp con el monto YA descontado (lo que cobra Flow), y
-- agregamos columnas para reconstruir el cálculo en soporte/contabilidad.
alter table public.payments
  add column if not exists coupon_id uuid references public.coupons(id),
  add column if not exists coupon_code text,
  add column if not exists discount_clp integer
    check (discount_clp is null or discount_clp >= 0);

create index if not exists payments_coupon_id_idx on public.payments(coupon_id);

-- Cupón inicial: 50% de descuento, sin caducidad ni cupos limitados.
insert into public.coupons (code, percent_off, label, active)
values ('LANZAMIENTO50', 50, 'Lanzamiento Diplomado 2026 — 50% off', true)
on conflict (code) do nothing;
