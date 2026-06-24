-- =============================================================================
-- Capital Academy — Evaluaciones por clase EN VIVO (scope='session')
-- Spec: docs/specs/quiz-evaluaciones-por-clase.md  ·  Extensión a class_sessions
--
-- Qué hace (TODO ADITIVO — espeja 0033, no rompe final/módulo/lección):
--   (1) `evaluations` gana scope='session' + columna session_id → class_sessions.
--   (2) Extiende la coherencia scope↔target con la rama session.
--   (3) A lo sumo UNA evaluación activa por sesión (permite borradores).
--
-- A diferencia de lesson/module (que cuelgan del programa), una sesión pertenece
-- a una COHORTE. El program_id de la evaluación se deriva en la API desde
-- cohort.program_id de la sesión. La RLS NO cambia: la policy existente
-- `evaluations_student_select` ya gatea por program_id + matrícula activa, así que
-- el acceso del alumno a un quiz de sesión es program-wide (formativo, sin
-- certificado). Idempotente y reversible (no borra columnas ni datos).
-- =============================================================================

-- ── 1. Columna session_id ─────────────────────────────────────────────────────
alter table public.evaluations
  add column if not exists session_id uuid references public.class_sessions(id) on delete cascade;

-- ── 2. Ampliar el enum de scope ───────────────────────────────────────────────
-- Los registros existentes (final/module/lesson) siguen siendo válidos.
alter table public.evaluations drop constraint if exists evaluations_scope_check;
alter table public.evaluations
  add constraint evaluations_scope_check
  check (scope in ('final', 'module', 'lesson', 'session'));

-- ── 3. Coherencia scope ↔ target (agrega la rama session) ─────────────────────
-- Las filas existentes tienen session_id NULL, así que las ramas final/module/
-- lesson con `and session_id is null` se satisfacen sin revalidación fallida.
alter table public.evaluations drop constraint if exists evaluations_scope_target;
alter table public.evaluations
  add constraint evaluations_scope_target check (
    (scope = 'final'   and module_id is null     and lesson_id is null     and session_id is null) or
    (scope = 'module'  and module_id is not null  and lesson_id is null     and session_id is null) or
    (scope = 'lesson'  and lesson_id is not null  and module_id is null     and session_id is null) or
    (scope = 'session' and session_id is not null and module_id is null     and lesson_id is null)
  );

-- ── 4. Índices ────────────────────────────────────────────────────────────────
-- A lo sumo UNA evaluación activa por sesión (permite borradores).
create unique index if not exists evaluations_one_active_per_session
  on public.evaluations (session_id)
  where scope = 'session' and is_active;

create index if not exists evaluations_session_idx on public.evaluations (session_id);
