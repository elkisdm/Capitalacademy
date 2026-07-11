-- =============================================================================
-- Capital Academy — Incrementar redemptions de un cupón al confirmarse el pago.
-- coupons.max_redemptions nunca se hacía efectivo: nada incrementaba
-- coupons.redemptions, así que un cupón con cupo limitado se podía canjear
-- infinitas veces (pérdida de ingresos). Este RPC atómico lo incrementa; lo
-- llama el webhook de Flow cuando un pago con cupón pasa a `succeeded` por
-- primera vez (dentro del claim atómico `firstSuccess`).
-- =============================================================================

create or replace function public.increment_coupon_redemptions(p_coupon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Guard atómico: el UPDATE solo incrementa si aún hay cupo, así dos
  -- checkouts concurrentes con redemptions = max-1 no pueden ambos pasar
  -- (el pago ya ocurrió; esto es solo la contabilidad correcta del contador).
  update public.coupons
    set redemptions = redemptions + 1
    where id = p_coupon_id
      and (max_redemptions is null or redemptions < max_redemptions);
end;
$$;

-- Solo service_role puede ejecutarlo (el webhook llama vía admin client).
-- Se revoca execute de public/anon/authenticated: es security definer, así que
-- sin la revocación cualquiera podría inflar redemptions de un cupón ajeno.
revoke execute on function public.increment_coupon_redemptions(uuid) from public, anon, authenticated;
grant execute on function public.increment_coupon_redemptions(uuid) to service_role;
