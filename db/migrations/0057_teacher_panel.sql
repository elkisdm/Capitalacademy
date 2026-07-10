-- =============================================================================
-- Capital Academy — Panel del profesor: abre Conversaciones al docente. ADR-0013.
--
-- has_program_access (0044) solo cubría alumno matriculado + platform staff; un
-- docente puro (cohort_roles.role='teacher'/'assistant', sin matrícula) quedaba
-- fuera del feed de Conversaciones de su propio programa. is_program_staff (0044)
-- ya cubre platform staff + cohort teacher/assistant, así que reusarlo cubre
-- staff + docente + alumno en una sola condición.
--
-- Único cambio de BD de este ciclo. Idempotente (create or replace).
-- =============================================================================

create or replace function public.has_program_access(p_program_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_program_staff(p_program_id) or exists (
    select 1 from public.enrollments e
    join public.cohorts c on c.id = e.cohort_id
    where c.program_id = p_program_id
      and e.student_id = auth.uid()
      and e.status in ('active','completed')
  );
$$;
