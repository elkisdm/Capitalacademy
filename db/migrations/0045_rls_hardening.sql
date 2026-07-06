-- =============================================================================
-- Capital Academy — Endurecimiento RLS (hallazgos de auditoría 2026-07-06)
--
-- 1. profiles: la policy de SELECT dejaba a CUALQUIER compañero de cohorte leer
--    la fila COMPLETA de otro alumno (RUT, dirección, contacto de emergencia,
--    cumpleaños, etc.) — PII sensible bajo Ley 19.628. Se cierra a dueño + staff.
--    El display de autor en foro/comentarios ya NO depende de esta policy: se
--    resuelve server-side por service-role exponiendo solo id/nombre/avatar
--    (lib/profiles/public-authors.ts). Requiere ese código desplegado ANTES de
--    aplicar esta migración (si no, se rompe el nombre del autor en el foro).
--
-- 2. class_sessions: la policy exigía matrícula 'active', excluyendo a egresados
--    ('completed'), que perdían acceso a las grabaciones de clases en vivo. Se
--    alinea con lessons/program_modules/has_program_access → ('active','completed').
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles_select — dueño + staff (sin la rama de compañeros de cohorte)
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid() or is_platform_staff()
  );

-- ----------------------------------------------------------------------------
-- 2. class_sessions_select — incluir egresados ('completed')
-- ----------------------------------------------------------------------------
drop policy if exists class_sessions_select on public.class_sessions;
create policy class_sessions_select on public.class_sessions
  for select using (
    is_platform_staff() or exists (
      select 1 from public.enrollments e
      where e.cohort_id = class_sessions.cohort_id
        and e.student_id = auth.uid()
        and e.status in ('active', 'completed')
        and (
          class_sessions.audience = 'all'
          or (class_sessions.audience = 'capital_inteligente' and e.segment = 'capital_inteligente')
        )
    )
  );
