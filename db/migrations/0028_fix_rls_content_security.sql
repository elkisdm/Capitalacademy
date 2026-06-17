-- =============================================================================
-- Capital Academy — Fix RLS: PII de profiles + aislamiento de catálogo entre tenants
-- Auditoría 2026-06-17 (bloqueantes CRÍTICO 1 y 3):
--   · profiles_select era auth.uid() is not null → cualquier alumno leía RUT/teléfono
--     /dirección de TODA la plataforma.
--   · program_modules, lessons y lesson_resources: misma política → alumno de un
--     programa veía catálogo (mux_playback_id, recursos) de otro programa.
-- =============================================================================

-- ── 1. profiles ───────────────────────────────────────────────────────────────
-- Regla nueva: propio perfil + staff de plataforma + comparte cohorte
-- Nota Fase 1 pendiente: column-level security (view profiles_public) para no exponer
-- RUT/teléfono a compañeros de cohorte (acceptable tradeoff en esta versión).

DROP POLICY IF EXISTS profiles_select ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_platform_staff()
    OR EXISTS (
      -- mismo cohort: alumno/profesor/asistente puede ver el perfil de sus compañeros
      -- (necesario para nombres en comentarios y roster). PII restringida a compañeros
      -- de programa, no expuesta cross-programa.
      SELECT 1
      FROM public.cohort_roles cr_viewer
      JOIN public.cohort_roles cr_target
        ON cr_target.cohort_id = cr_viewer.cohort_id
      WHERE cr_viewer.user_id = auth.uid()
        AND cr_target.user_id = profiles.id
    )
  );

-- ── 2. program_modules ────────────────────────────────────────────────────────
-- Solo puede ver módulos de un programa si está matriculado en una cohorte
-- que corre ese programa, o si es docente/asistente en dicha cohorte, o staff.

DROP POLICY IF EXISTS program_modules_select ON public.program_modules;

CREATE POLICY program_modules_select ON public.program_modules
  FOR SELECT USING (
    public.is_platform_staff()
    OR EXISTS (
      SELECT 1
      FROM public.cohorts c
      JOIN public.enrollments e ON e.cohort_id = c.id
      WHERE c.program_id = program_modules.program_id
        AND e.student_id = auth.uid()
        AND e.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.cohort_roles cr
      JOIN public.cohorts c ON c.id = cr.cohort_id
      WHERE c.program_id = program_modules.program_id
        AND cr.user_id = auth.uid()
        AND cr.role IN ('teacher', 'assistant')
    )
  );

-- ── 3. lessons ────────────────────────────────────────────────────────────────
-- Análogo: solo lecciones del programa al que el usuario tiene acceso.
-- Protege mux_playback_id de exposición cross-tenant (bloquea el cross-tenant viewer).

DROP POLICY IF EXISTS lessons_select ON public.lessons;

CREATE POLICY lessons_select ON public.lessons
  FOR SELECT USING (
    public.is_platform_staff()
    OR EXISTS (
      SELECT 1
      FROM public.program_modules pm
      JOIN public.cohorts c ON c.program_id = pm.program_id
      JOIN public.enrollments e ON e.cohort_id = c.id
      WHERE pm.id = lessons.module_id
        AND e.student_id = auth.uid()
        AND e.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.cohort_roles cr
      JOIN public.cohorts c ON c.id = cr.cohort_id
      JOIN public.program_modules pm ON pm.program_id = c.program_id
      WHERE pm.id = lessons.module_id
        AND cr.user_id = auth.uid()
        AND cr.role IN ('teacher', 'assistant')
    )
  );

-- ── 4. lesson_resources ───────────────────────────────────────────────────────
-- Recursos (PDFs, links) solo accesibles para alumnos del programa correspondiente.

DROP POLICY IF EXISTS lesson_resources_select ON public.lesson_resources;

CREATE POLICY lesson_resources_select ON public.lesson_resources
  FOR SELECT USING (
    public.is_platform_staff()
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.program_modules pm ON pm.id = l.module_id
      JOIN public.cohorts c ON c.program_id = pm.program_id
      JOIN public.enrollments e ON e.cohort_id = c.id
      WHERE l.id = lesson_resources.lesson_id
        AND e.student_id = auth.uid()
        AND e.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.cohort_roles cr
      JOIN public.cohorts c ON c.id = cr.cohort_id
      JOIN public.program_modules pm ON pm.program_id = c.program_id
      JOIN public.lessons l ON l.module_id = pm.id
      WHERE l.id = lesson_resources.lesson_id
        AND cr.user_id = auth.uid()
        AND cr.role IN ('teacher', 'assistant')
    )
  );
