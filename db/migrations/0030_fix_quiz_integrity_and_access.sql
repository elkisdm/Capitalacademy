-- =============================================================================
-- Capital Academy — Fase 0 Megaauditoría v2 (docs/audit/2026-06-19-...-v2.md)
--   (1) Integridad del quiz: intento aprobado único por matrícula (cierra el
--       bypass de certificación / la race de doble-submit) + default 1 intento
--       (RN-025: el MVP permite 1 solo intento).
--   (2) Acceso permanente al contenido (RN-049/050, RN-T03): el estado académico
--       'completed' (al cerrar la cohorte) NO debe cortar el acceso técnico al
--       catálogo. Se amplía la LECTURA del catálogo a ('active','completed');
--       se bloquea solo 'dropped'/'suspended'. Mismo patrón que 0028.
--
-- NOTA DE ALCANCE (deuda conocida, follow-up): el acoplamiento a status='active'
-- también existe en las policies de SELECT de lesson_transcripts (0008),
-- lesson_summaries (0009), lesson_chapters (0010), lesson_comments (0011),
-- class_sessions (0023/0024) y session_resources (0027). Al cerrar la cohorte un
-- alumni mantendrá módulos/lecciones/video (este fix) pero perderá transcripción/
-- resumen/comentarios/calendario hasta que un follow-up amplíe esas policies
-- (idealmente vía un helper has_program_access()). No se incluyen aquí para
-- acotar el blast radius de esta migración a lo que evita el lockout duro.
-- quiz_configs (0015) y las policies de escritura se dejan en 'active' a propósito
-- (un alumni no re-rinde el quiz ni escribe contenido post-cierre).
-- =============================================================================

-- ── 1. Intento aprobado único por matrícula ───────────────────────────────────
-- Invariante de BD: un enrollment no puede tener 2+ intentos aprobados. Cierra la
-- race de doble-submit (check-then-act sin lock) y respalda el "ya aprobaste".
create unique index if not exists quiz_attempts_one_pass_per_enrollment
  on public.quiz_attempts (enrollment_id)
  where passed = true;

-- ── 2. Default de intentos = 1 (RN-025) ───────────────────────────────────────
-- Solo afecta configs NUEVAS; las existentes conservan su valor (decisión de negocio).
alter table public.quiz_configs alter column max_attempts set default 1;

-- ── 3. Acceso permanente al catálogo (RN-049/050, RN-T03) ─────────────────────
-- Recrea las 3 policies de 0028 ampliando enrollment.status a ('active','completed').

drop policy if exists program_modules_select on public.program_modules;
create policy program_modules_select on public.program_modules
  for select using (
    public.is_platform_staff()
    or exists (
      select 1
      from public.cohorts c
      join public.enrollments e on e.cohort_id = c.id
      where c.program_id = program_modules.program_id
        and e.student_id = auth.uid()
        and e.status in ('active', 'completed')
    )
    or exists (
      select 1
      from public.cohort_roles cr
      join public.cohorts c on c.id = cr.cohort_id
      where c.program_id = program_modules.program_id
        and cr.user_id = auth.uid()
        and cr.role in ('teacher', 'assistant')
    )
  );

drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons
  for select using (
    public.is_platform_staff()
    or exists (
      select 1
      from public.program_modules pm
      join public.cohorts c on c.program_id = pm.program_id
      join public.enrollments e on e.cohort_id = c.id
      where pm.id = lessons.module_id
        and e.student_id = auth.uid()
        and e.status in ('active', 'completed')
    )
    or exists (
      select 1
      from public.cohort_roles cr
      join public.cohorts c on c.id = cr.cohort_id
      join public.program_modules pm on pm.program_id = c.program_id
      where pm.id = lessons.module_id
        and cr.user_id = auth.uid()
        and cr.role in ('teacher', 'assistant')
    )
  );

drop policy if exists lesson_resources_select on public.lesson_resources;
create policy lesson_resources_select on public.lesson_resources
  for select using (
    public.is_platform_staff()
    or exists (
      select 1
      from public.lessons l
      join public.program_modules pm on pm.id = l.module_id
      join public.cohorts c on c.program_id = pm.program_id
      join public.enrollments e on e.cohort_id = c.id
      where l.id = lesson_resources.lesson_id
        and e.student_id = auth.uid()
        and e.status in ('active', 'completed')
    )
    or exists (
      select 1
      from public.cohort_roles cr
      join public.cohorts c on c.id = cr.cohort_id
      join public.program_modules pm on pm.program_id = c.program_id
      join public.lessons l on l.module_id = pm.id
      where l.id = lesson_resources.lesson_id
        and cr.user_id = auth.uid()
        and cr.role in ('teacher', 'assistant')
    )
  );
