-- =============================================================================
-- Capital Academy — Tipificación de lecciones por tipo de actividad
-- Brief: docs/briefs/quizzes-programados-y-tipificacion-de-lecciones.md · Cambio 2
--
-- Qué hace (TODO ADITIVO):
--   `lessons` gana `activity_type` (text, NOT NULL, default 'class'), con CHECK
--   que admite 'class' | 'practice' | 'evaluation' (ver ADR-0017, corrección B1
--   del brief: 'integration' NO es un tipo aparte, queda dentro de 'practice').
--
-- Decisiones (ver ADR-0017):
--   - NO se toca el enum `lesson_kind` (0001): es MODALIDAD (presencial/online/
--     grabada), ortogonal al tipo de actividad. `lesson_kind` lo comparten
--     `lessons.kind` y `class_sessions.modality`; mezclar ahí sería incoherente.
--   - `text` + CHECK, no enum nuevo (mismo patrón que `evaluations.scope`,
--     0033:23): un CHECK se reemplaza con drop/add; un enum no admite eliminar
--     ni renombrar valores.
--   - `not null default 'class'`: en PG 11+ no reescribe la tabla. Todas las
--     lecciones existentes quedan 'class' (statu quo). Sin backfill de datos:
--     la re-etiquetación es trabajo manual de la profe (criterio pedagógico).
--
-- Idempotente y reversible (no borra columnas ni datos).
-- =============================================================================

alter table public.lessons
  add column if not exists activity_type text not null default 'class';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lessons_activity_type_chk'
  ) then
    alter table public.lessons
      add constraint lessons_activity_type_chk
      check (activity_type in ('class', 'practice', 'evaluation'));
  end if;
end $$;
