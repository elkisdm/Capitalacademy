-- =============================================================================
-- Capital Academy — Módulo Classroom (VOD)
-- Extiende lessons con metadata de Mux. Crea video_progress para tracking
-- granular y lesson_resources para materiales descargables.
-- ADR: docs/adr/0002-arquitectura-modulo-classroom.md
--      docs/adr/0003-tracking-progreso-video.md
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Columnas Mux en lessons
-- ----------------------------------------------------------------------------
alter table public.lessons
  add column if not exists mux_asset_id text,
  add column if not exists mux_playback_id text,
  add column if not exists mux_upload_id text,
  add column if not exists video_duration_seconds int,
  add column if not exists thumbnail_url text;

create index if not exists lessons_mux_asset_idx
  on public.lessons(mux_asset_id) where mux_asset_id is not null;

-- ----------------------------------------------------------------------------
-- Tracking de progreso de video por alumno
-- ----------------------------------------------------------------------------
create type video_progress_source as enum ('player', 'manual', 'system');

create table public.video_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,

  playback_position_seconds int not null default 0,
  duration_seconds int not null,
  max_position_seconds int not null default 0,
  watch_percentage numeric(5,2) not null default 0,

  completed boolean not null default false,
  completed_at timestamptz,

  source video_progress_source not null default 'player',
  last_watched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (enrollment_id, lesson_id)
);

create index video_progress_enrollment_idx
  on public.video_progress(enrollment_id);
create index video_progress_lesson_completed_idx
  on public.video_progress(lesson_id, completed);

-- ----------------------------------------------------------------------------
-- Recursos por lección
-- ----------------------------------------------------------------------------
create type resource_type as enum ('pdf', 'link', 'template', 'document', 'other');

create table public.lesson_resources (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  title text not null,
  type resource_type not null default 'other',
  url text not null,
  storage_path text,
  file_size_bytes bigint,
  position int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index lesson_resources_lesson_idx
  on public.lesson_resources(lesson_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.video_progress enable row level security;
alter table public.lesson_resources enable row level security;

-- video_progress: alumno lee/escribe solo su propio progreso
create policy video_progress_student_select on public.video_progress
  for select using (
    enrollment_id in (
      select id from public.enrollments where student_id = auth.uid()
    )
  );

create policy video_progress_student_insert on public.video_progress
  for insert with check (
    enrollment_id in (
      select id from public.enrollments where student_id = auth.uid()
    )
  );

create policy video_progress_student_update on public.video_progress
  for update using (
    enrollment_id in (
      select id from public.enrollments where student_id = auth.uid()
    )
  );

-- video_progress: staff lee todo (reportes)
create policy video_progress_staff_select on public.video_progress
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('ops', 'admin', 'teacher')
    )
  );

-- lesson_resources: todos los autenticados leen
create policy lesson_resources_authenticated_select on public.lesson_resources
  for select using (auth.uid() is not null);

-- lesson_resources: staff escribe
create policy lesson_resources_staff_insert on public.lesson_resources
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('ops', 'admin', 'teacher')
    )
  );

create policy lesson_resources_staff_update on public.lesson_resources
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('ops', 'admin', 'teacher')
    )
  );

create policy lesson_resources_staff_delete on public.lesson_resources
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('ops', 'admin')
    )
  );
