-- =============================================================================
-- Capital Academy — La escritura de `instructors` pasa a `system_role`
--
-- PROBLEMA (verificado en producción, 2026-07-29):
-- La policy `instructors_staff_write` (creada en 0022_seed_diplomado_g4.sql) exige
-- la columna LEGACY `profiles.role`:
--
--   USING (exists (select 1 from profiles
--                  where profiles.id = auth.uid()
--                    and profiles.role in ('ops','admin','teacher')))
--
-- Pero en prod esa columna ya no refleja los roles reales. Conteo real:
--
--   system_role | role (legacy) | cuentas
--   ------------+---------------+--------
--   ops         | student       |   2      <-- Paola y el equipo de operaciones
--   admin       | admin         |   2
--
-- O sea: las 2 cuentas de operaciones NO pueden escribir `instructors` (la policy
-- las ve como 'student'), y las 2 de admin pasan solo porque su columna legacy
-- coincide por casualidad. Además 'teacher' ni existe en el enum `system_role`.
-- Es el "tercer sistema de roles" que ya venía marcado como peligroso justamente
-- para el día en que alimentara autorización. Ese día llegó.
--
-- SOLUCIÓN:
-- Usar la función canónica `is_platform_staff()` (SECURITY DEFINER, STABLE, lee
-- `profiles.system_role in ('ops','admin')`) — la misma que ya usa la policy de
-- lectura `instructors_program_scoped_select` de esta tabla. Una sola fuente de
-- verdad para el rol.
--
-- Se declaran USING y WITH CHECK de forma EXPLÍCITA. La policy anterior era
-- `FOR ALL` con `with_check = NULL`: Postgres cae al USING para validar las filas
-- nuevas, así que funcionalmente no había hueco, pero dejarlo implícito es el
-- mismo patrón que en `quiz_attempts` sí abrió un agujero real (fraude de
-- certificación, megaauditoría del 16-jul). No se repite la forma.
--
-- NO cambia quién puede LEER: `instructors_program_scoped_select` queda intacta.
-- Idempotente y segura de re-aplicar.
-- =============================================================================

drop policy if exists instructors_staff_write on public.instructors;

create policy instructors_staff_write
  on public.instructors
  for all
  to authenticated
  using (public.is_platform_staff())
  with check (public.is_platform_staff());

-- Verificación (correr a mano tras aplicar):
--   select policyname, cmd, qual, with_check
--     from pg_policies
--    where tablename = 'instructors';
-- Se espera que `instructors_staff_write` muestre is_platform_staff() en AMBAS
-- columnas, y que `instructors_program_scoped_select` siga igual.
