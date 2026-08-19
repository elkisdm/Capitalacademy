-- 0100 — Reordenar módulos de un programa desde el panel.
--
-- Hasta ahora `program_modules.position` solo se asignaba al crear (última + 1)
-- y no había forma de cambiarla sin SQL: operaciones pidió subir "Bienvenida CI"
-- al primer lugar del Ciclo de Capacitación y quedó bloqueada, porque la lección
-- sí se reordena (0032) pero el módulo que la contiene no.
--
-- Espejo exacto de `reorder_lessons` (0032): un offset temporal fuera de rango
-- para no chocar con unique(program_id, position), y luego 1..N en el orden
-- recibido. Sin el offset, el primer UPDATE del bucle choca con la fila que
-- todavía ocupa esa posición.

create or replace function public.reorder_modules(
  p_program_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
as $$
declare
  v_id uuid;
  v_pos int := 1;
  v_total int;
  v_recibidos int;
begin
  -- La lista tiene que venir COMPLETA: un módulo ausente se quedaría con la
  -- posición del offset, invisible al final de la lista y corrupta. Se comprueba
  -- por CONTEO y ANTES de mutar nada — un guardia basado en el rango del offset
  -- se escapa con posiciones raras (un 0 aterriza justo en el límite, y una
  -- negativa cae por debajo).
  select count(*) into v_total
    from public.program_modules where program_id = p_program_id;

  select count(distinct pm.id) into v_recibidos
    from public.program_modules pm
    where pm.program_id = p_program_id and pm.id = any(p_ordered_ids);

  if v_recibidos <> v_total then
    raise exception 'reorder_modules: p_ordered_ids debe incluir todos los módulos del programa (% de %)', v_recibidos, v_total;
  end if;

  -- Fuera de rango para no chocar con unique(program_id, position).
  update public.program_modules
    set position = position + 1000000
    where program_id = p_program_id;

  -- Reasignar 1..N en el orden recibido (solo módulos de ESE programa: un id
  -- ajeno que se cuele en el arreglo no mueve nada).
  foreach v_id in array p_ordered_ids loop
    update public.program_modules
      set position = v_pos
      where id = v_id and program_id = p_program_id;
    v_pos := v_pos + 1;
  end loop;
end;
$$;

-- En Supabase, anon/authenticated reciben grant propio (no solo vía PUBLIC), así
-- que hay que revocarlos explícitamente. La función es SECURITY INVOKER → los
-- UPDATE quedan gateados por la RLS de program_modules. La ruta API la llama vía
-- service_role (admin client), con authorizeAdmin por delante.
revoke execute on function public.reorder_modules(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_modules(uuid, uuid[]) to service_role;
