-- =============================================================================
-- Capital Academy — Hardening del modelo de evaluaciones (post-auditoría)
-- Spec: docs/specs/quiz-evaluaciones-por-clase.md
--
-- Cierra hallazgos de la auditoría adversarial del feature 0033:
--   (1) Preserva el historial académico: quiz_attempts.evaluation_id pasa de
--       ON DELETE CASCADE a ON DELETE SET NULL (borrar una evaluación ya no
--       borra los intentos de alumnos; el CRUD igual bloquea el borrado con
--       intentos, esto es defensa en profundidad ante un DELETE directo en BD).
--   (2) Integridad de la respuesta correcta: CHECK de forma de correct_answer
--       según question_type (string para single/true_false, array para
--       multiple/short). La certificación depende de este dato.
--   (3) Elimina quiz_configs: tabla zombi cuya data ya vive en
--       evaluations(scope='final'); ningún código la lee/escribe.
--
-- Aditivo/seguro: verificado en prod que 0 filas violan el CHECK y que
-- quiz_configs ya está migrada a evaluations.
-- =============================================================================

-- ── 1. Preservar historial: evaluation_id de intentos → SET NULL ──────────────
alter table public.quiz_attempts
  drop constraint if exists quiz_attempts_evaluation_id_fkey;

alter table public.quiz_attempts
  add constraint quiz_attempts_evaluation_id_fkey
  foreign key (evaluation_id) references public.evaluations(id) on delete set null;

-- ── 2. Integridad de forma de correct_answer por tipo ─────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quiz_questions_correct_answer_shape'
  ) then
    alter table public.quiz_questions
      add constraint quiz_questions_correct_answer_shape check (
        correct_answer is null or
        (question_type in ('single_choice', 'true_false') and jsonb_typeof(correct_answer) = 'string') or
        (question_type in ('multiple_choice', 'short_answer') and jsonb_typeof(correct_answer) = 'array')
      );
  end if;
end $$;

-- ── 3. Eliminar la tabla zombi quiz_configs (data ya en evaluations) ──────────
drop table if exists public.quiz_configs;
