-- =============================================================================
-- Capital Academy — Migración 0027: recursos asociados a sesiones en vivo.
--
-- Nueva definición: no todas las clases son video online. Una sesión (sobre
-- todo las presenciales) puede tener materiales asociados (PDF, enlace, plantilla,
-- documento). Esto espeja `lesson_resources` (recursos de lecciones grabadas),
-- pero colgando de `class_sessions` en vez de `lessons`.
--
-- Patrón: basado en URL (título + tipo + enlace), igual que lesson_resources.
-- No hay subida de archivos; el recurso se referencia por URL.
--
-- RLS: lectura para staff o alumno con matrícula activa cuya audiencia calce
--      con la sesión (respeta el modelo de audiencia de 0024). Escritura solo
--      staff (plataforma o staff del cohorte).
-- Helpers: public.is_platform_staff(), public.is_cohort_staff(cohort_id) (0007).
--
-- Idempotente: create ... if not exists, drop policy if exists antes de create.
-- =============================================================================

create table if not exists public.session_resources (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  title text not null,
  type text not null,
  url text not null,
  position int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint session_resources_type_chk
    check (type in ('pdf', 'link', 'template', 'document', 'other'))
);

create index if not exists session_resources_session_idx
  on public.session_resources(session_id, position);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.session_resources enable row level security;

-- Lectura: staff, o alumno que puede ver la sesión padre (matrícula activa +
-- audiencia que calce). Replica la lógica de class_sessions_select (0024)
-- porque las policies no heredan la RLS de la subconsulta.
drop policy if exists session_resources_select on public.session_resources;
create policy session_resources_select on public.session_resources
  for select using (
    public.is_platform_staff()
    or exists (
      select 1
      from public.class_sessions cs
      join public.enrollments e on e.cohort_id = cs.cohort_id
      where cs.id = session_resources.session_id
        and e.student_id = auth.uid()
        and e.status = 'active'
        and (
          cs.audience = 'all'
          or (cs.audience = 'capital_inteligente' and e.segment = 'capital_inteligente')
        )
    )
  );

-- Escritura: staff de plataforma o staff del cohorte de la sesión.
drop policy if exists session_resources_insert_staff on public.session_resources;
create policy session_resources_insert_staff on public.session_resources
  for insert with check (
    public.is_platform_staff()
    or exists (
      select 1 from public.class_sessions cs
      where cs.id = session_resources.session_id
        and public.is_cohort_staff(cs.cohort_id)
    )
  );

drop policy if exists session_resources_update_staff on public.session_resources;
create policy session_resources_update_staff on public.session_resources
  for update using (
    public.is_platform_staff()
    or exists (
      select 1 from public.class_sessions cs
      where cs.id = session_resources.session_id
        and public.is_cohort_staff(cs.cohort_id)
    )
  );

drop policy if exists session_resources_delete_staff on public.session_resources;
create policy session_resources_delete_staff on public.session_resources
  for delete using (
    public.is_platform_staff()
    or exists (
      select 1 from public.class_sessions cs
      where cs.id = session_resources.session_id
        and public.is_cohort_staff(cs.cohort_id)
    )
  );
