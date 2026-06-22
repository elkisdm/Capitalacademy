-- =============================================================================
-- Capital Academy — Evaluaciones por clase (lección/módulo) + tipos de pregunta
-- Spec: docs/specs/quiz-evaluaciones-por-clase.md  ·  Fase 1 (fundación)
--
-- Qué hace (TODO ADITIVO — no rompe el flujo final endurecido en 0030):
--   (1) Tabla `evaluations`: contenedor de quiz con alcance final | module | lesson.
--   (2) `quiz_questions` gana question_type + correct_answer (jsonb) + evaluation_id.
--       `correct_option`/`options` se conservan (compat); las preguntas viejas se
--       backfillean a single_choice.
--   (3) `quiz_attempts` gana evaluation_id (los intentos del final se re-linkean).
--   (4) Migración data-preserving: cada quiz_config existente → una fila
--       evaluations(scope='final'); las preguntas y los intentos del programa se
--       linkean a esa evaluación final.
--
-- IMPORTANTE: el código del quiz final SIGUE leyendo `quiz_configs` hasta Fase 4.
-- Esta migración solo agrega estructura y copia datos. Idempotente y reversible
-- (no borra columnas ni `quiz_configs`).
-- =============================================================================

-- ── 1. Tabla evaluations ──────────────────────────────────────────────────────
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  scope text not null check (scope in ('final', 'module', 'lesson')),
  module_id uuid references public.program_modules(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  title text not null,
  description text,
  passing_grade_pct int not null default 70 check (passing_grade_pct between 1 and 100),
  questions_per_attempt int check (questions_per_attempt is null or questions_per_attempt >= 1),
  max_attempts int not null default 3 check (max_attempts >= 1),
  time_limit_minutes int,
  min_completion_pct int check (min_completion_pct is null or min_completion_pct between 1 and 100),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Coherencia de alcance: el target obligatorio según scope, los otros NULL.
  constraint evaluations_scope_target check (
    (scope = 'final'  and module_id is null and lesson_id is null) or
    (scope = 'module' and module_id is not null and lesson_id is null) or
    (scope = 'lesson' and lesson_id is not null and module_id is null)
  )
);

-- Un único quiz FINAL por programa (preserva el invariante de quiz_configs).
create unique index if not exists evaluations_one_final_per_program
  on public.evaluations (program_id)
  where scope = 'final';

-- A lo sumo UNA evaluación activa por lección / por módulo (permite borradores).
create unique index if not exists evaluations_one_active_per_lesson
  on public.evaluations (lesson_id)
  where scope = 'lesson' and is_active;

create unique index if not exists evaluations_one_active_per_module
  on public.evaluations (module_id)
  where scope = 'module' and is_active;

create index if not exists evaluations_program_idx on public.evaluations (program_id);
create index if not exists evaluations_lesson_idx on public.evaluations (lesson_id);
create index if not exists evaluations_module_idx on public.evaluations (module_id);

drop trigger if exists trg_evaluations_updated_at on public.evaluations;
create trigger trg_evaluations_updated_at
  before update on public.evaluations
  for each row execute function public.tg_set_updated_at();

-- ── 2. quiz_questions: tipos de pregunta + dueño evaluation ───────────────────
alter table public.quiz_questions
  add column if not exists evaluation_id uuid references public.evaluations(id) on delete cascade;

alter table public.quiz_questions
  add column if not exists question_type text not null default 'single_choice';

-- Constraint del tipo (separado para que el ADD COLUMN sea idempotente).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quiz_questions_question_type_check'
  ) then
    alter table public.quiz_questions
      add constraint quiz_questions_question_type_check
      check (question_type in ('single_choice', 'multiple_choice', 'true_false', 'short_answer'));
  end if;
end $$;

-- Respuesta correcta unificada (jsonb):
--   single_choice/true_false → "A" (string)
--   multiple_choice          → ["A","C"]
--   short_answer             → ["respuesta aceptada", "sinónimo"]
alter table public.quiz_questions
  add column if not exists correct_answer jsonb;

-- correct_option pasa a ser nullable (short_answer/multiple no lo usan).
alter table public.quiz_questions alter column correct_option drop not null;

create index if not exists quiz_questions_evaluation_idx
  on public.quiz_questions (evaluation_id);

-- ── 3. quiz_attempts: evaluation_id ───────────────────────────────────────────
alter table public.quiz_attempts
  add column if not exists evaluation_id uuid references public.evaluations(id) on delete cascade;

create index if not exists quiz_attempts_evaluation_idx
  on public.quiz_attempts (evaluation_id);

-- ── 4. Migración de datos: quiz_configs → evaluations(scope='final') ──────────
-- Una evaluación final por cada config existente. Idempotente: no duplica si ya
-- corrió (el índice único parcial lo respalda; el WHERE NOT EXISTS lo evita).
insert into public.evaluations (
  program_id, scope, title, passing_grade_pct, questions_per_attempt,
  max_attempts, time_limit_minutes, min_completion_pct, is_active, created_at
)
select
  qc.program_id,
  'final',
  'Evaluación final',
  qc.passing_grade_pct,
  qc.questions_per_attempt,
  qc.max_attempts,
  qc.time_limit_minutes,
  qc.min_completion_pct,
  qc.is_active,
  qc.created_at
from public.quiz_configs qc
where not exists (
  select 1 from public.evaluations e
  where e.program_id = qc.program_id and e.scope = 'final'
);

-- Linkear preguntas existentes a la evaluación final de su programa + tipar.
update public.quiz_questions q
set evaluation_id = e.id
from public.evaluations e
where e.program_id = q.program_id
  and e.scope = 'final'
  and q.evaluation_id is null;

-- Backfill del tipo y la respuesta unificada para preguntas viejas.
update public.quiz_questions
set question_type = 'single_choice'
where question_type is null;

update public.quiz_questions
set correct_answer = to_jsonb(correct_option)
where correct_answer is null and correct_option is not null;

-- Re-linkear intentos existentes a la evaluación final de su programa.
update public.quiz_attempts a
set evaluation_id = e.id
from public.evaluations e
where e.program_id = a.program_id
  and e.scope = 'final'
  and a.evaluation_id is null;

-- ── 5. RLS de evaluations ─────────────────────────────────────────────────────
alter table public.evaluations enable row level security;

-- Staff (ops/admin): control total.
drop policy if exists evaluations_staff_all on public.evaluations;
create policy evaluations_staff_all on public.evaluations
  for all using (public.is_platform_staff());

-- Alumno: lee evaluaciones ACTIVAS de su programa (vía cohort→program), con
-- matrícula no expulsada. El alumno nunca lee quiz_questions directo (va por API
-- con admin client, igual que el final) — esta policy solo expone metadatos del
-- contenedor para que el classroom sepa qué evaluación mostrar.
drop policy if exists evaluations_student_select on public.evaluations;
create policy evaluations_student_select on public.evaluations
  for select using (
    is_active
    and exists (
      select 1
      from public.enrollments e
      join public.cohorts c on c.id = e.cohort_id
      where e.student_id = auth.uid()
        and c.program_id = evaluations.program_id
        and e.status in ('active', 'completed')
    )
  );

-- Teacher/assistant de la cohorte: lectura (para revisar evaluaciones del programa).
drop policy if exists evaluations_staff_cohort_select on public.evaluations;
create policy evaluations_staff_cohort_select on public.evaluations
  for select using (
    exists (
      select 1
      from public.cohort_roles cr
      join public.cohorts c on c.id = cr.cohort_id
      where c.program_id = evaluations.program_id
        and cr.user_id = auth.uid()
        and cr.role in ('teacher', 'assistant')
    )
  );
