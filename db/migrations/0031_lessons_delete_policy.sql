-- =============================================================================
-- Capital Academy — Editor de clases: policy de DELETE faltante en lessons.
-- 0007 dejó lessons con insert (lessons_write_staff) y update
-- (lessons_update_cohort_staff) pero SIN policy de delete → cualquier borrado por
-- el cliente RLS queda denegado. El editor de lecciones necesita poder eliminar.
-- Se espeja program_modules_delete_staff: solo staff de plataforma (ops/admin).
-- =============================================================================

drop policy if exists lessons_delete_staff on public.lessons;
create policy lessons_delete_staff on public.lessons
  for delete using (public.is_platform_staff());
