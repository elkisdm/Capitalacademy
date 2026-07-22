-- =============================================================================
-- Capital Academy — quiz_questions.correct_option acepta A–F (reunión clienta,
-- bug: crear pregunta de opción única con respuesta correcta E o F falla).
--
-- CAUSA RAÍZ
-- 0015_quiz_and_certificates.sql:33 definió
--   correct_option text not null check (correct_option in ('A','B','C','D'))
-- La 0033 le quitó el NOT NULL pero nunca tocó el CHECK. La UI de preguntas
-- (components/admin/quiz/question-draft.ts OPTION_LETTERS) y el schema
-- compartido (lib/classroom/quiz-question-schema.ts) ya soportan hasta 6
-- opciones (A–F) para single_choice, así que el insert con correct_option
-- 'E' o 'F' viola el CHECK viejo (23514) y la API devuelve 500.
--
-- QUÉ HACE esta migración
-- Busca el/los constraint CHECK existentes sobre public.quiz_questions cuya
-- definición mencione `correct_option` (sin asumir un nombre fijo, por si el
-- constraint fue renombrado o recreado en algún ambiente) y los elimina, luego
-- crea uno nuevo que acepta A–F (o NULL).
--
-- Idempotente: el `do $$` es reejecutable — si el constraint ya fue
-- reemplazado, el loop no encuentra nada que borrar y el ADD CONSTRAINT usa
-- `if not exists` implícito vía chequeo previo en pg_constraint, acotado a
-- public.quiz_questions (el nombre de constraint no es único a nivel global).
-- =============================================================================

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.quiz_questions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%correct_option%'
  loop
    execute format('alter table public.quiz_questions drop constraint %I', c.conname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quiz_questions_correct_option_check'
      and conrelid = 'public.quiz_questions'::regclass
  ) then
    alter table public.quiz_questions
      add constraint quiz_questions_correct_option_check
      check (correct_option is null or correct_option in ('A','B','C','D','E','F'));
  end if;
end $$;
