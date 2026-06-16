-- =============================================================================
-- Capital Academy — Migración 0024: audiencia de sesiones + segmento de alumno
-- (etiqueta "Capital Inteligente") y RLS de calendario diferenciado.
--
-- Brief: feature 2d — etiqueta "Capital Inteligente" + calendario diferenciado.
-- Depende de: 0007 (helpers RLS is_platform_staff), 0023 (policy
-- class_sessions_select que ESTA migración reemplaza).
--
-- Decisión de modelado: el segmento se guarda como COLUMNA en enrollments
-- (no como tabla enrollment_tags). Justificación: la relación es 1:1 con la
-- matrícula, es un único segmento de marketing mutuamente excluyente por
-- alumno-en-cohorte y se consulta directo dentro de la subquery de la policy
-- de class_sessions. Una tabla de tags solo se justificaría con MÚLTIPLES
-- etiquetas simultáneas por matrícula, que no es el caso (YAGNI). Si en el
-- futuro hacen falta varias etiquetas, se migra entonces.
--
-- La marca es MANUAL por staff (el correo no es confiable como criterio).
--
-- Idempotente: "add column if not exists", "drop policy if exists" antes de
-- "create policy". Se usa CHECK en vez de enum para mantener idempotencia
-- trivial (alterar un enum requiere bloque DO).
-- =============================================================================

-- 1. class_sessions.audience: a quién va dirigida la sesión.
--    'all' = todos los alumnos del cohorte; 'capital_inteligente' = solo
--    alumnos marcados como Capital Inteligente (clases extra martes AM).
alter table public.class_sessions
  add column if not exists audience text not null default 'all';

alter table public.class_sessions
  drop constraint if exists class_sessions_audience_check;
alter table public.class_sessions
  add constraint class_sessions_audience_check
  check (audience in ('all', 'capital_inteligente'));

-- 2. enrollments.segment: segmento del alumno en el cohorte (nullable).
--    null = sin segmento; 'capital_inteligente' = alumno Capital Inteligente.
alter table public.enrollments
  add column if not exists segment text;

alter table public.enrollments
  drop constraint if exists enrollments_segment_check;
alter table public.enrollments
  add constraint enrollments_segment_check
  check (segment is null or segment in ('capital_inteligente'));

-- Índice parcial: acelera el subquery de la RLS y los listados que filtran por
-- alumnos Capital Inteligente. Solo indexa filas marcadas (la mayoría de
-- matrículas tendrá segment null).
create index if not exists enrollments_segment_idx
  on public.enrollments (cohort_id, student_id)
  where segment is not null;

-- 3. RLS: reemplaza la policy de 0023 para incluir el filtro de audiencia.
--    El alumno ve una sesión si:
--      a) es staff de plataforma (ve todo), O
--      b) tiene matrícula activa en el cohorte de la sesión Y
--         (la sesión es 'all'  OR  (es 'capital_inteligente' Y su matrícula
--          tiene segment='capital_inteligente')).
--    La subquery a enrollments resuelve bajo RLS porque la policy
--    enrollments_own_select (0007) permite al alumno leer su propia fila
--    (e.student_id = auth.uid()).
drop policy if exists class_sessions_select on public.class_sessions;
create policy class_sessions_select on public.class_sessions
  for select using (
    public.is_platform_staff()
    or exists (
      select 1 from public.enrollments e
      where e.cohort_id = class_sessions.cohort_id
        and e.student_id = auth.uid()
        and e.status = 'active'
        and (
          class_sessions.audience = 'all'
          or (
            class_sessions.audience = 'capital_inteligente'
            and e.segment = 'capital_inteligente'
          )
        )
    )
  );