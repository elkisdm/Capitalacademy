-- =============================================================================
-- Capital Academy — Editor de clases: reordenar lecciones de un módulo.
-- El `unique(module_id, position)` impide swaps directos (choca el índice). Un
-- RPC atómico reasigna posiciones en una sola transacción: primero corre todas
-- las lecciones del módulo fuera de rango (+offset, preserva unicidad), luego
-- reasigna 1..N según el orden recibido. Atómico = sin estados intermedios
-- inconsistentes visibles.
--
-- Seguridad: solo service_role puede ejecutarlo (la ruta API gatea con
-- authorizeAdmin y llama vía admin client). Se revoca execute de public.
-- =============================================================================

create or replace function public.reorder_lessons(
  p_module_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
as $$
declare
  v_id uuid;
  v_pos int := 1;
begin
  -- Fuera de rango para no chocar con unique(module_id, position).
  update public.lessons
    set position = position + 1000000
    where module_id = p_module_id;

  -- Reasignar 1..N en el orden recibido (solo lecciones del módulo).
  foreach v_id in array p_ordered_ids loop
    update public.lessons
      set position = v_pos
      where id = v_id and module_id = p_module_id;
    v_pos := v_pos + 1;
  end loop;
end;
$$;

-- En Supabase, anon/authenticated reciben grant propio (no solo vía PUBLIC), así
-- que hay que revocarlos explícitamente. Nota: aunque pudieran ejecutarlo, la
-- función es SECURITY INVOKER → los UPDATE quedan gateados por la RLS de lessons
-- (no-staff = 0 filas). La ruta API lo llama vía service_role (admin client).
revoke execute on function public.reorder_lessons(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_lessons(uuid, uuid[]) to service_role;
