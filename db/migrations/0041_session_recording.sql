-- =============================================================================
-- Capital Academy — Repetición de clases EN VIVO (grabación Mux por sesión)
-- Spec (Tier 3, spec-flow): la grabación de una clase en vivo ES una lección
-- grabada, enlazada a la sesión vía `class_sessions.lesson_id`.
--
-- Diseño (Opción A): se reutiliza toda la infra de `lessons` (upload Mux,
-- webhook, reproductor, progreso, transcripción, IA) en lugar de duplicar
-- columnas Mux en `class_sessions`. La columna `class_sessions.lesson_id` ya
-- existía (0001) pero estaba SIN USO en la app; aquí se le fija una semántica:
--   class_sessions.lesson_id → la lección-repetición de esa clase en vivo.
--
-- RLS: NO cambia. `lessons_select` (0028) ya gatea por matrícula activa en la
-- cohorte del módulo, y la lección-repetición vive bajo el módulo de la sesión,
-- así que el alumno matriculado la lee con la política existente.
--
-- TODO ADITIVO · idempotente · reversible (no borra columnas ni datos).
-- =============================================================================

-- ── 1. Una lección es la repetición de A LO SUMO una sesión ───────────────────
-- Evita que la misma lección quede enlazada como repetición de dos sesiones.
create unique index if not exists class_sessions_recording_lesson_uniq
  on public.class_sessions (lesson_id)
  where lesson_id is not null;

-- ── 2. Reverse lookup eficiente ───────────────────────────────────────────────
-- Soporta excluir las lecciones-repetición del playlist normal del módulo y
-- resolver "¿esta lección es la repetición de una sesión?" en el lado alumno.
create index if not exists class_sessions_lesson_idx
  on public.class_sessions (lesson_id)
  where lesson_id is not null;

-- ── 3. Documentar la semántica en el catálogo ─────────────────────────────────
comment on column public.class_sessions.lesson_id is
  'Lección-repetición (kind=recorded) de esta clase en vivo. Se excluye del playlist normal del módulo; se accede vía la pantalla de la clase. Ver migración 0041.';
