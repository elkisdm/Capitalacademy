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
begin
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

  -- Un id faltante dejaría su módulo en el offset (+1000000), invisible al final
  -- de la lista y con la posición corrupta. Se exige la lista COMPLETA.
  -- El comparador es >= y no >: un módulo guardado en position 0 aterriza en
  -- EXACTAMENTE 1000000 y con > se escapaba justo del guardia que lo cuida.
  if exists (
    select 1 from public.program_modules
    where program_id = p_program_id and position >= 1000000
  ) then
    raise exception 'reorder_modules: p_ordered_ids debe incluir todos los módulos del programa';
  end if;
end;
$$;

-- En Supabase, anon/authenticated reciben grant propio (no solo vía PUBLIC), así
-- que hay que revocarlos explícitamente. La función es SECURITY INVOKER → los
-- UPDATE quedan gateados por la RLS de program_modules. La ruta API la llama vía
-- service_role (admin client), con authorizeAdmin por delante.
revoke execute on function public.reorder_modules(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_modules(uuid, uuid[]) to service_role;
