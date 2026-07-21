-- =============================================================================
-- Capital Academy — Optimización RLS: cortar recursión + initplan caching
-- (incidente: timeouts masivos 57014 en app/api/classroom/progress/route.ts)
--
-- CAUSA RAÍZ
-- Las policies de video_progress filtran con
--   enrollment_id in (select e.id from public.enrollments e where ...)
-- Esa subconsulta evalúa la tabla enrollments FILA POR FILA, lo que a su vez
-- dispara la RLS de enrollments (que consulta cohort_roles), que a su vez
-- dispara la RLS de cohort_roles (que consulta profiles vía is_platform_staff()).
-- El resultado es una cascada RLS-dentro-de-RLS-dentro-de-RLS.
-- Además, NINGÚN auth.uid() del repo estaba envuelto en (select auth.uid()):
-- Postgres no cachea el valor como "initplan" y lo reevalúa por cada fila
-- candidata en vez de una sola vez por consulta.
-- Evidencia: la consulta corre en 0.118ms sin RLS vs. 3905ms de media con RLS;
-- profiles acumuló 1.638.810.865 idx_scans sobre solo 444 filas.
--
-- QUÉ HACE esta migración
-- 1. Crea dos funciones SECURITY DEFINER (owns_enrollment, is_staff_of_enrollment)
--    que resuelven la pertenencia/staff de un enrollment_id SIN pasar por la
--    RLS de enrollments (bypass intencional vía security definer, igual patrón
--    que is_platform_staff/is_admin/get_cohort_role/has_cohort_access/
--    is_cohort_staff ya existentes desde 0007_rbac_cohort_roles.sql).
-- 2. Consolida las policies SELECT redundantes de video_progress (3→1),
--    enrollments (3→1) y cohort_roles (2→1) en una sola policy permisiva por
--    tabla, evitando que Postgres evalúe cada policy por separado.
-- 3. Envuelve TODAS las llamadas a auth.uid() / is_platform_staff() /
--    is_cohort_staff() / is_admin() en policies de video_progress, enrollments,
--    cohort_roles y profiles en (select ...) para forzar el initplan caching
--    (se evalúan UNA vez por consulta, no por fila).
--
-- QUÉ NO HACE
-- - No recrea is_platform_staff, is_admin, get_cohort_role, has_cohort_access
--   ni is_cohort_staff: ya son `language sql stable security definer
--   set search_path = public` desde 0007_rbac_cohort_roles.sql:68-136.
-- - No agrega índices: enrollments_student_idx, cohort_roles_user_idx,
--   video_progress_enrollment_id_lesson_id_key, etc. ya existen.
-- - No cambia semántica: cada policy consolidada es la unión lógica exacta de
--   las que reemplaza. Quién ve qué no cambia.
--
-- El bloque de ROLLBACK completo está comentado al final de este archivo.
-- =============================================================================

set local lock_timeout = '5s';

-- ----------------------------------------------------------------------------
-- PASO 1: funciones helper que cortan la recursión sobre enrollments
-- ----------------------------------------------------------------------------

create or replace function public.owns_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment_id
      and e.student_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_enrollment(uuid) from public;
grant execute on function public.owns_enrollment(uuid) to authenticated;

create or replace function public.is_staff_of_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.enrollments e
    where e.id = p_enrollment_id
      and public.is_cohort_staff(e.cohort_id)
  );
$$;

revoke all on function public.is_staff_of_enrollment(uuid) from public;
grant execute on function public.is_staff_of_enrollment(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- PASO 2: video_progress — consolidar SELECT (3→1) + initplan en insert/update
-- ----------------------------------------------------------------------------

drop policy if exists video_progress_own_select on public.video_progress;
drop policy if exists video_progress_cohort_staff_select on public.video_progress;
drop policy if exists video_progress_platform_staff_select on public.video_progress;

create policy video_progress_select on public.video_progress
  for select using (
    (select public.owns_enrollment(video_progress.enrollment_id))
    or (select public.is_staff_of_enrollment(video_progress.enrollment_id))
    or (select public.is_platform_staff())
  );

drop policy if exists video_progress_own_insert on public.video_progress;

create policy video_progress_own_insert on public.video_progress
  for insert with check (
    (select public.owns_enrollment(video_progress.enrollment_id))
  );

drop policy if exists video_progress_own_update on public.video_progress;

create policy video_progress_own_update on public.video_progress
  for update using (
    (select public.owns_enrollment(video_progress.enrollment_id))
  );

-- ----------------------------------------------------------------------------
-- PASO 3: enrollments — consolidar SELECT (3→1) + initplan en insert/update/delete
-- ----------------------------------------------------------------------------

drop policy if exists enrollments_own_select on public.enrollments;
drop policy if exists enrollments_cohort_staff_select on public.enrollments;
drop policy if exists enrollments_platform_staff_select on public.enrollments;

create policy enrollments_select on public.enrollments
  for select using (
    enrollments.student_id = (select auth.uid())
    or (select public.is_cohort_staff(enrollments.cohort_id))
    or (select public.is_platform_staff())
  );

drop policy if exists enrollments_insert_staff on public.enrollments;

create policy enrollments_insert_staff on public.enrollments
  for insert with check ((select public.is_platform_staff()));

drop policy if exists enrollments_update_staff on public.enrollments;

create policy enrollments_update_staff on public.enrollments
  for update using ((select public.is_platform_staff()));

drop policy if exists enrollments_delete_staff on public.enrollments;

create policy enrollments_delete_staff on public.enrollments
  for delete using ((select public.is_platform_staff()));

-- ----------------------------------------------------------------------------
-- PASO 4: cohort_roles — consolidar SELECT (2→1) + initplan en insert/update/delete
-- ----------------------------------------------------------------------------

drop policy if exists cohort_roles_own_select on public.cohort_roles;
drop policy if exists cohort_roles_staff_select on public.cohort_roles;

create policy cohort_roles_select on public.cohort_roles
  for select using (
    cohort_roles.user_id = (select auth.uid())
    or (select public.is_platform_staff())
  );

drop policy if exists cohort_roles_admin_insert on public.cohort_roles;

create policy cohort_roles_admin_insert on public.cohort_roles
  for insert with check ((select public.is_platform_staff()));

drop policy if exists cohort_roles_admin_update on public.cohort_roles;

create policy cohort_roles_admin_update on public.cohort_roles
  for update using ((select public.is_admin()));

drop policy if exists cohort_roles_admin_delete on public.cohort_roles;

create policy cohort_roles_admin_delete on public.cohort_roles
  for delete using ((select public.is_admin()));

-- ----------------------------------------------------------------------------
-- PASO 5: profiles — initplan en select/update/insert (misma semántica de 0045)
-- ----------------------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
  for select using (
    profiles.id = (select auth.uid())
    or (select public.is_platform_staff())
  );

drop policy if exists profiles_update_own on public.profiles;

create policy profiles_update_own on public.profiles
  for update using (
    profiles.id = (select auth.uid())
    or (select public.is_platform_staff())
  );

drop policy if exists profiles_insert_staff on public.profiles;

create policy profiles_insert_staff on public.profiles
  for insert with check ((select public.is_platform_staff()));

-- ----------------------------------------------------------------------------
-- PASO 6: refrescar estadísticas del planificador
-- ----------------------------------------------------------------------------

analyze public.video_progress;
analyze public.enrollments;
analyze public.cohort_roles;
analyze public.profiles;

-- =============================================================================
-- ROLLBACK — restaura literalmente el estado previo verificado en pg_policies
-- antes de aplicar esta migración. Ejecutar manualmente si hace falta revertir.
-- =============================================================================

-- set local lock_timeout = '5s';
--
-- drop policy if exists video_progress_select on public.video_progress;
-- drop policy if exists video_progress_own_insert on public.video_progress;
-- drop policy if exists video_progress_own_update on public.video_progress;
--
-- create policy video_progress_own_select on public.video_progress
--   for select using (
--     enrollment_id in (
--       select e.id from public.enrollments e
--       where e.student_id = auth.uid()
--     )
--   );
--
-- create policy video_progress_own_insert on public.video_progress
--   for insert with check (
--     enrollment_id in (
--       select e.id from public.enrollments e
--       where e.student_id = auth.uid()
--     )
--   );
--
-- create policy video_progress_own_update on public.video_progress
--   for update using (
--     enrollment_id in (
--       select e.id from public.enrollments e
--       where e.student_id = auth.uid()
--     )
--   );
--
-- create policy video_progress_cohort_staff_select on public.video_progress
--   for select using (
--     enrollment_id in (
--       select e.id from public.enrollments e
--       where public.is_cohort_staff(e.cohort_id)
--     )
--   );
--
-- create policy video_progress_platform_staff_select on public.video_progress
--   for select using (public.is_platform_staff());
--
-- drop policy if exists enrollments_select on public.enrollments;
-- drop policy if exists enrollments_insert_staff on public.enrollments;
-- drop policy if exists enrollments_update_staff on public.enrollments;
-- drop policy if exists enrollments_delete_staff on public.enrollments;
--
-- create policy enrollments_own_select on public.enrollments
--   for select using (student_id = auth.uid());
--
-- create policy enrollments_cohort_staff_select on public.enrollments
--   for select using (
--     exists (
--       select 1 from public.cohort_roles cr
--       where cr.user_id = auth.uid()
--         and cr.cohort_id = enrollments.cohort_id
--         and cr.role in ('teacher', 'assistant')
--     )
--   );
--
-- create policy enrollments_platform_staff_select on public.enrollments
--   for select using (public.is_platform_staff());
--
-- create policy enrollments_insert_staff on public.enrollments
--   for insert with check (public.is_platform_staff());
--
-- create policy enrollments_update_staff on public.enrollments
--   for update using (public.is_platform_staff());
--
-- create policy enrollments_delete_staff on public.enrollments
--   for delete using (public.is_platform_staff());
--
-- drop policy if exists cohort_roles_select on public.cohort_roles;
-- drop policy if exists cohort_roles_admin_insert on public.cohort_roles;
-- drop policy if exists cohort_roles_admin_update on public.cohort_roles;
-- drop policy if exists cohort_roles_admin_delete on public.cohort_roles;
--
-- create policy cohort_roles_own_select on public.cohort_roles
--   for select using (user_id = auth.uid());
--
-- create policy cohort_roles_staff_select on public.cohort_roles
--   for select using (public.is_platform_staff());
--
-- create policy cohort_roles_admin_insert on public.cohort_roles
--   for insert with check (public.is_platform_staff());
--
-- create policy cohort_roles_admin_update on public.cohort_roles
--   for update using (public.is_admin());
--
-- create policy cohort_roles_admin_delete on public.cohort_roles
--   for delete using (public.is_admin());
--
-- drop policy if exists profiles_select on public.profiles;
-- drop policy if exists profiles_update_own on public.profiles;
-- drop policy if exists profiles_insert_staff on public.profiles;
--
-- create policy profiles_select on public.profiles
--   for select using (
--     id = auth.uid() or is_platform_staff()
--   );
--
-- create policy profiles_update_own on public.profiles
--   for update using (
--     id = auth.uid()
--     or public.is_platform_staff()
--   );
--
-- create policy profiles_insert_staff on public.profiles
--   for insert with check (public.is_platform_staff());
--
-- drop function if exists public.owns_enrollment(uuid);
-- drop function if exists public.is_staff_of_enrollment(uuid);
