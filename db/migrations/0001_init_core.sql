-- =============================================================================
-- Capital Academy — Migración inicial (E1, E2, E3, E4, E5)
-- Esqueleto: usuarios, roles, programas, cohortes, módulos, lecciones,
-- matrículas y sesiones de clase. RLS habilitado, políticas por definir.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- E1. Roles y perfiles
-- ----------------------------------------------------------------------------
create type user_role as enum ('student', 'teacher', 'ops', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role user_role not null default 'student',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles(role);

-- ----------------------------------------------------------------------------
-- E2/E4. Programas (diplomados) y cohortes
-- ----------------------------------------------------------------------------
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  total_modules int,
  passing_grade numeric(3, 1) default 4.0,
  min_attendance_pct int not null default 85,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create type cohort_status as enum ('planned', 'active', 'closed', 'archived');

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  code text not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  status cohort_status not null default 'planned',
  slack_channel_id text,
  created_at timestamptz not null default now(),
  unique (program_id, code)
);

-- ----------------------------------------------------------------------------
-- E4. Módulos y lecciones
-- ----------------------------------------------------------------------------
create table public.program_modules (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  position int not null,
  code text not null,
  title text not null,
  description text,
  weight numeric(5, 2),
  teacher_id uuid references public.profiles(id) on delete set null,
  unique (program_id, position),
  unique (program_id, code)
);

create type lesson_kind as enum ('live_in_person', 'live_online', 'recorded');

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.program_modules(id) on delete cascade,
  position int not null,
  title text not null,
  description text,
  kind lesson_kind not null,
  unlock_at timestamptz,
  duration_minutes int,
  unique (module_id, position)
);

-- ----------------------------------------------------------------------------
-- E3. Matrícula y asignaciones
-- ----------------------------------------------------------------------------
create type enrollment_status as enum ('invited', 'active', 'suspended', 'completed', 'dropped');

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status enrollment_status not null default 'invited',
  drive_folder_id text,
  drive_folder_url text,
  enrolled_at timestamptz not null default now(),
  unique (cohort_id, student_id)
);

create index enrollments_student_idx on public.enrollments(student_id);
create index enrollments_cohort_idx on public.enrollments(cohort_id);

-- ----------------------------------------------------------------------------
-- E5. Sesiones de clase (presencial / online)
-- ----------------------------------------------------------------------------
create type session_status as enum ('scheduled', 'in_progress', 'finished', 'cancelled');

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  module_id uuid references public.program_modules(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  modality lesson_kind not null,
  meeting_url text,
  recording_url text,
  status session_status not null default 'scheduled',
  rescheduled_from uuid references public.class_sessions(id),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index class_sessions_cohort_starts_idx on public.class_sessions(cohort_id, starts_at);

-- ----------------------------------------------------------------------------
-- Trigger genérico: updated_at
-- ----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS habilitado en todas las tablas. Políticas se agregarán en migraciones
-- posteriores junto con las funciones helpers (current_role, in_cohort, etc).
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.programs enable row level security;
alter table public.cohorts enable row level security;
alter table public.program_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.class_sessions enable row level security;
