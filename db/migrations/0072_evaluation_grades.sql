-- =============================================================================
-- Capital Academy — Evaluaciones y notas 1-7 (v1)
-- Brief: docs/briefs/evaluaciones-y-notas-1-7.md
--
-- Qué hace (TODO ADITIVO — no rompe `deliverables`, certificados ni los
-- quizzes ya rendidos):
--   (1) `evaluations` gana `kind` ('quiz' | 'manual') + `weight_pct` (captura,
--       v1 no calcula nota final ponderada).
--   (2) Los 3 índices únicos parciales "una activa por lección/módulo/sesión"
--       (0033/0040) se acotan a `kind='quiz'`: el módulo práctico necesita
--       varias evaluaciones MANUALES activas a la vez (roleplay, guión de
--       venta, etc). `evaluations_one_final_per_program` NO se toca.
--   (3) `programs.grade_exigencia_pct` (default 60): el % que corresponde a
--       nota 4.0 en la escala chilena. Deliberadamente SEPARADO de
--       `evaluations.passing_grade_pct` (default 70, umbral de `passed`
--       booleano del quiz — otro eje, ver ADR-0018).
--   (4) `evaluation_criteria`: checklist parametrizable por evaluación.
--   (5) `evaluation_grades`: nota 1-7 por alumno (ancla `enrollment_id`, no
--       `evaluations` — la nota es por alumno Y por cohorte). Se ALMACENA
--       (no se deriva): registro académico = snapshot inmutable.
--   (6) Helpers de RLS `is_evaluation_staff` / `has_evaluation_access` +
--       policies. DESVIACIÓN DELIBERADA: la lectura de notas por staff usa
--       `is_cohort_staff` (cohorte), no `is_program_staff` (programa) — un
--       docente de una cohorte no debe leer notas de otra cohorte del mismo
--       programa.
--
-- Fuera de esta migración (ver brief, sección "Qué NO hacer en v1"):
--   cálculo de nota final ponderada, cambios a `deliverables`, cambios a
--   certificados, recalcular `score_pct` de intentos históricos.
--
-- Idempotente y reversible (no borra columnas ni datos existentes).
-- =============================================================================

-- ── 1. evaluations: kind + weight_pct ─────────────────────────────────────────
alter table public.evaluations
  add column if not exists kind text not null default 'quiz';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'evaluations_kind_chk'
  ) then
    alter table public.evaluations
      add constraint evaluations_kind_chk
      check (kind in ('quiz', 'manual'));
  end if;
end $$;

alter table public.evaluations
  add column if not exists weight_pct numeric(5,2);

-- ── 2. Acotar los índices únicos "una activa" a kind='quiz' ───────────────────
-- Preserva la semántica actual (a lo sumo un quiz activo por lección/módulo/
-- sesión) y libera el modelo del módulo práctico: varias evaluaciones
-- MANUALES activas a la vez sobre el mismo módulo/lección/sesión.
drop index if exists evaluations_one_active_per_lesson;
create unique index evaluations_one_active_per_lesson
  on public.evaluations (lesson_id)
  where scope = 'lesson' and is_active and kind = 'quiz';

drop index if exists evaluations_one_active_per_module;
create unique index evaluations_one_active_per_module
  on public.evaluations (module_id)
  where scope = 'module' and is_active and kind = 'quiz';

drop index if exists evaluations_one_active_per_session;
create unique index evaluations_one_active_per_session
  on public.evaluations (session_id)
  where scope = 'session' and is_active and kind = 'quiz';

-- ── 3. programs.grade_exigencia_pct ───────────────────────────────────────────
alter table public.programs
  add column if not exists grade_exigencia_pct int not null default 60;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'programs_grade_exigencia_pct_chk'
  ) then
    alter table public.programs
      add constraint programs_grade_exigencia_pct_chk
      check (grade_exigencia_pct between 1 and 99);
  end if;
end $$;

-- ── 4. evaluation_criteria: checklist parametrizable ──────────────────────────
create table if not exists public.evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  position int not null default 0,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evaluation_id, position)
);

create index if not exists evaluation_criteria_evaluation_idx
  on public.evaluation_criteria (evaluation_id);

drop trigger if exists trg_evaluation_criteria_updated_at on public.evaluation_criteria;
create trigger trg_evaluation_criteria_updated_at
  before update on public.evaluation_criteria
  for each row execute function public.tg_set_updated_at();

-- ── 5. evaluation_grades: nota 1-7 por alumno ─────────────────────────────────
create table if not exists public.evaluation_grades (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  grade numeric(2,1) check (grade is null or (grade between 1.0 and 7.0)),
  score_pct numeric(5,2),
  source text not null default 'manual',
  quiz_attempt_id uuid references public.quiz_attempts(id) on delete set null,
  feedback text,
  criteria_marks jsonb not null default '[]'::jsonb,
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (evaluation_id, enrollment_id),
  constraint evaluation_grades_source_chk check (source in ('manual', 'quiz', 'import')),
  constraint evaluation_grades_feedback_len_chk check (feedback is null or char_length(feedback) <= 4000),
  constraint evaluation_grades_criteria_marks_chk
    check (jsonb_typeof(criteria_marks) = 'array')
);

create index if not exists evaluation_grades_evaluation_idx
  on public.evaluation_grades (evaluation_id);
create index if not exists evaluation_grades_enrollment_idx
  on public.evaluation_grades (enrollment_id);

drop trigger if exists trg_evaluation_grades_updated_at on public.evaluation_grades;
create trigger trg_evaluation_grades_updated_at
  before update on public.evaluation_grades
  for each row execute function public.tg_set_updated_at();

-- ── 6. Helpers de RLS ──────────────────────────────────────────────────────────
-- Acceso de LECTURA de un alumno matriculado al programa de la evaluación
-- (mismo criterio que evaluations_student_select, sin exigir is_active — el
-- alumno lee los criterios de una evaluación aunque esté en borrador NO; ver
-- policy de criterios más abajo, que sí exige is_active vía evaluations).
create or replace function public.has_evaluation_access(p_evaluation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.evaluations e
    join public.cohorts c on c.program_id = e.program_id
    join public.enrollments en on en.cohort_id = c.id
    where e.id = p_evaluation_id
      and en.student_id = auth.uid()
      and en.status in ('active', 'completed')
  );
$$;

-- Staff (platform o cohort teacher/assistant) con acceso a la evaluación: se
-- resuelve vía CUALQUIER cohorte del programa de la evaluación (los criterios
-- son a nivel de evaluación, no de cohorte).
create or replace function public.is_evaluation_staff(p_evaluation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_staff() or exists (
    select 1
    from public.evaluations e
    join public.cohorts c on c.program_id = e.program_id
    join public.cohort_roles cr on cr.cohort_id = c.id
    where e.id = p_evaluation_id
      and cr.user_id = auth.uid()
      and cr.role in ('teacher', 'assistant')
  );
$$;

-- ── 7. RLS: evaluation_criteria ────────────────────────────────────────────────
alter table public.evaluation_criteria enable row level security;

drop policy if exists evaluation_criteria_select on public.evaluation_criteria;
create policy evaluation_criteria_select on public.evaluation_criteria
  for select using (
    public.has_evaluation_access(evaluation_id)
    or public.is_evaluation_staff(evaluation_id)
  );

drop policy if exists evaluation_criteria_staff_all on public.evaluation_criteria;
create policy evaluation_criteria_staff_all on public.evaluation_criteria
  for all using (public.is_evaluation_staff(evaluation_id))
  with check (public.is_evaluation_staff(evaluation_id));

-- ── 8. RLS: evaluation_grades ──────────────────────────────────────────────────
alter table public.evaluation_grades enable row level security;

-- Alumno: solo SU nota, y solo si está publicada.
drop policy if exists evaluation_grades_student_select on public.evaluation_grades;
create policy evaluation_grades_student_select on public.evaluation_grades
  for select using (
    published_at is not null
    and enrollment_id in (
      select e.id from public.enrollments e where e.student_id = auth.uid()
    )
  );

-- Staff: platform staff, o teacher/assistant de la cohorte de la matrícula.
-- DESVIACIÓN DELIBERADA (ver cabecera): is_cohort_staff, no is_program_staff.
drop policy if exists evaluation_grades_staff_select on public.evaluation_grades;
create policy evaluation_grades_staff_select on public.evaluation_grades
  for select using (
    public.is_platform_staff()
    or exists (
      select 1 from public.enrollments e
      where e.id = evaluation_grades.enrollment_id
        and public.is_cohort_staff(e.cohort_id)
    )
  );

-- Solo platform staff via API con service-role escribe notas (server-side,
-- ver lib/auth/authorize-admin.ts:requireEvaluationStaff). NO hay policy de
-- INSERT/UPDATE para el alumno ni para el rol autenticado normal: el docente
-- de cohorte escribe a través del endpoint con `createAdminClient()`.
drop policy if exists evaluation_grades_staff_write on public.evaluation_grades;
create policy evaluation_grades_staff_write on public.evaluation_grades
  for all using (public.is_platform_staff())
  with check (public.is_platform_staff());
