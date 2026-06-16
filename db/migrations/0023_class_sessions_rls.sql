-- =============================================================================
-- Capital Academy — Políticas RLS para class_sessions (vista de calendario).
--
-- ADR: docs/adr/0008-entorno-diplomado-y-calendario-de-sesiones.md
-- Brief: docs/briefs/fase2-calendario-y-segmentacion-diplomado.md (2a)
--
-- class_sessions tenía RLS habilitado (0001) pero SIN políticas: ninguna
-- lectura vía cliente con RLS era posible. Se agrega lectura para:
--   - alumnos con matrícula activa en el cohorte (chequeo directo a enrollments,
--     igual que video_progress, para no depender del sync enrollments→cohort_roles)
--   - staff de plataforma (ops/admin) vía helper is_platform_staff() (0007)
--
-- La escritura (editor de calendario, Fase 2b) corre por service_role desde
-- rutas API protegidas con authorizeAdmin; no se abre por RLS aquí.
-- =============================================================================

drop policy if exists class_sessions_select on public.class_sessions;
create policy class_sessions_select on public.class_sessions
  for select using (
    public.is_platform_staff()
    or exists (
      select 1 from public.enrollments e
      where e.cohort_id = class_sessions.cohort_id
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );
