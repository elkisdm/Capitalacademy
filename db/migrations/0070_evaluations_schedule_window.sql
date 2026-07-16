-- =============================================================================
-- Capital Academy — Ventana de programación (apertura/cierre) de evaluaciones
-- Brief: docs/briefs/quizzes-programados-y-tipificacion-de-lecciones.md · Cambio 1
--
-- Qué hace (TODO ADITIVO — no rompe el toggle manual `is_active` existente):
--   (1) `evaluations` gana `opens_at`/`closes_at` (timestamptz, NULLABLE).
--   (2) CHECK que tolera NULLs y exige `closes_at > opens_at` cuando ambas están.
--   (3) Índice de apoyo para evaluaciones activas con ventana.
--   (4) Recrea `evaluations_student_select` (0033) sumando la ventana.
--
-- Decisiones (ver ADR-0016):
--   - `is_active` sigue siendo el master switch (publicada/borrador); los 3
--     índices únicos parciales de 0033/0040 dependen de `is_active` y NO se
--     tocan — un índice único no puede depender de `now()` (no es IMMUTABLE).
--   - `opens_at`/`closes_at` son NULLABLE y OPCIONALES: NULL/NULL = disponible
--     mientras `is_active`, comportamiento actual exacto. Cero cambio al desplegar.
--   - Las policies `evaluations_staff_all` y `evaluations_staff_cohort_select`
--     NO se tocan: el staff debe seguir viendo lo programado y lo cerrado.
--
-- Idempotente y reversible (no borra columnas ni datos).
-- =============================================================================

-- 1. Columnas de ventana (opcionales).
alter table public.evaluations
  add column if not exists opens_at timestamptz;

alter table public.evaluations
  add column if not exists closes_at timestamptz;

-- 2. CHECK: tolera NULLs; si ambas están, cierre debe ser posterior a apertura.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'evaluations_window_chk'
  ) then
    alter table public.evaluations
      add constraint evaluations_window_chk
      check (
        opens_at is null or closes_at is null or closes_at > opens_at
      );
  end if;
end $$;

-- 3. Índice de apoyo: evaluaciones activas con ventana configurada.
create index if not exists evaluations_window_idx
  on public.evaluations (opens_at, closes_at)
  where is_active;

-- 4. Recrea evaluations_student_select (0033:168-180) sumando la ventana.
--    El alumno solo ve evaluaciones activas Y dentro de su ventana (si la tiene).
drop policy if exists evaluations_student_select on public.evaluations;
create policy evaluations_student_select on public.evaluations
  for select using (
    is_active
    and (opens_at is null or now() >= opens_at)
    and (closes_at is null or now() <= closes_at)
    and exists (
      select 1
      from public.enrollments e
      join public.cohorts c on c.id = e.cohort_id
      where e.student_id = auth.uid()
        and c.program_id = evaluations.program_id
        and e.status in ('active', 'completed')
    )
  );
