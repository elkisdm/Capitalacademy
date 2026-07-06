-- =============================================================================
-- Capital Academy — Cierra la escalación de privilegios vía profiles.system_role
--
-- Hallazgo (auditoría 2026-07-06, CONFIRMADO en prod): la policy
-- `profiles_update_own` (USING id=auth.uid() OR is_platform_staff(), sin
-- WITH CHECK) + el grant de columna UPDATE sobre `system_role`/`role` a
-- `authenticated` permitían que CUALQUIER alumno hiciera
--   PATCH /rest/v1/profiles?id=eq.<su-uid>  { "system_role": "admin" }
-- y se auto-convirtiera en platform staff, leyendo toda la PII y ganando
-- poderes de escritura de staff. Anulaba en la práctica el fix de PII (0045).
--
-- Por qué un trigger y NO `REVOKE UPDATE (system_role) FROM authenticated`:
-- la edición legítima de roles por un admin (app/api/admin/users/[userId])
-- corre con el JWT del admin (rol `authenticated`), no service_role, así que
-- un REVOKE la rompería. El trigger distingue por actor:
--   - usuario final (auth.role() authenticated/anon) que NO es staff → BLOQUEA
--   - admin (is_platform_staff) → PERMITE (edita roles desde el panel)
--   - procesos server-side (service_role / postgres, auth.role() no cliente) → PERMITE
--
-- Idempotente (create or replace + drop trigger if exists).
-- =============================================================================

create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.system_role is distinct from old.system_role
      or new.role is distinct from old.role) then
    if coalesce(auth.role(), '') in ('authenticated', 'anon')
       and not public.is_platform_staff() then
      raise exception 'No autorizado para cambiar el rol del perfil';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_escalation on public.profiles;
create trigger trg_prevent_role_self_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_role_self_escalation();
