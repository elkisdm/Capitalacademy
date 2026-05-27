-- =============================================================================
-- Capital Academy — Migración RBAC: roles por cohorte
-- ADR-0004: Modelo de permisos RBAC multi-tenant por cohorte
-- =============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- PASO 1: system_role en profiles
-- ────────────────────────────────────────────────────────────────────────────

create type system_role as enum ('user', 'ops', 'admin');

alter table public.profiles
  add column system_role system_role not null default 'user';

update public.profiles set system_role = 'admin' where role = 'admin';
update public.profiles set system_role = 'ops'   where role = 'ops';
update public.profiles set system_role = 'user'  where role not in ('admin', 'ops');

create index profiles_system_role_idx on public.profiles(system_role);

-- ────────────────────────────────────────────────────────────────────────────
-- PASO 2: tabla cohort_roles
-- ────────────────────────────────────────────────────────────────────────────

create type cohort_role_kind as enum ('student', 'teacher', 'assistant');

create table public.cohort_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  role cohort_role_kind not null,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),

  unique (user_id, cohort_id, role)
);

create index cohort_roles_user_idx on public.cohort_roles(user_id);
create index cohort_roles_cohort_idx on public.cohort_roles(cohort_id);
create index cohort_roles_cohort_role_idx on public.cohort_roles(cohort_id, role);

alter table public.cohort_roles enable row level security;

-- ────────────────────────────────────────────────────────────────────────────
-- PASO 3: migrar datos existentes
-- ────────────────────────────────────────────────────────────────────────────

-- 3a. Cada enrollment activo → cohort_role 'student'
insert into public.cohort_roles (user_id, cohort_id, role)
select e.student_id, e.cohort_id, 'student'::cohort_role_kind
from public.enrollments e
where e.status = 'active'
on conflict (user_id, cohort_id, role) do nothing;

-- 3b. Cada teacher_id de program_modules → cohort_role 'teacher' en cada cohorte activa
insert into public.cohort_roles (user_id, cohort_id, role)
select distinct pm.teacher_id, c.id, 'teacher'::cohort_role_kind
from public.program_modules pm
inner join public.cohorts c on c.program_id = pm.program_id
where pm.teacher_id is not null
  and c.status in ('planned', 'active')
on conflict (user_id, cohort_id, role) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- PASO 4: funciones helper para RLS
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and system_role in ('ops', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and system_role = 'admin'
  );
$$;

create or replace function public.get_cohort_role(p_cohort_id uuid)
returns cohort_role_kind
language sql
stable
security definer
set search_path = public
as $$
  select role from public.cohort_roles
  where user_id = auth.uid()
    and cohort_id = p_cohort_id
  limit 1;
$$;

create or replace function public.has_cohort_access(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cohort_roles
    where user_id = auth.uid()
      and cohort_id = p_cohort_id
  );
$$;

create or replace function public.is_cohort_staff(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cohort_roles
    where user_id = auth.uid()
      and cohort_id = p_cohort_id
      and role in ('teacher', 'assistant')
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- PASO 5: DROP policies viejas + crear nuevas
-- ────────────────────────────────────────────────────────────────────────────

-- 5a. profiles
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select on public.profiles
  for select using (auth.uid() is not null);

create policy profiles_update_own on public.profiles
  for update using (
    id = auth.uid()
    or public.is_platform_staff()
  );

create policy profiles_insert_staff on public.profiles
  for insert with check (public.is_platform_staff());

-- 5b. programs (read-only for all authenticated)
drop policy if exists programs_select on public.programs;

create policy programs_select on public.programs
  for select using (auth.uid() is not null);

create policy programs_insert_admin on public.programs
  for insert with check (public.is_admin());

create policy programs_update_admin on public.programs
  for update using (public.is_admin());

create policy programs_delete_admin on public.programs
  for delete using (public.is_admin());

-- 5c. cohorts
drop policy if exists cohorts_select on public.cohorts;

create policy cohorts_select on public.cohorts
  for select using (
    public.has_cohort_access(id)
    or public.is_platform_staff()
  );

create policy cohorts_insert_staff on public.cohorts
  for insert with check (public.is_platform_staff());

create policy cohorts_update_staff on public.cohorts
  for update using (public.is_platform_staff());

create policy cohorts_delete_staff on public.cohorts
  for delete using (public.is_platform_staff());

-- 5d. program_modules
drop policy if exists program_modules_select on public.program_modules;

create policy program_modules_select on public.program_modules
  for select using (auth.uid() is not null);

create policy program_modules_insert_staff on public.program_modules
  for insert with check (public.is_platform_staff());

create policy program_modules_update_staff on public.program_modules
  for update using (public.is_platform_staff());

create policy program_modules_delete_staff on public.program_modules
  for delete using (public.is_platform_staff());

-- 5e. lessons
drop policy if exists lessons_select on public.lessons;
drop policy if exists lessons_update_staff on public.lessons;

create policy lessons_select on public.lessons
  for select using (auth.uid() is not null);

create policy lessons_write_staff on public.lessons
  for insert with check (public.is_platform_staff());

create policy lessons_update_cohort_staff on public.lessons
  for update using (
    public.is_platform_staff()
    or exists (
      select 1 from public.program_modules pm
      inner join public.cohorts c on c.program_id = pm.program_id
      where pm.id = lessons.module_id
        and public.is_cohort_staff(c.id)
    )
  );

-- 5f. enrollments
drop policy if exists enrollments_student_select on public.enrollments;
drop policy if exists enrollments_staff_select on public.enrollments;

create policy enrollments_own_select on public.enrollments
  for select using (student_id = auth.uid());

create policy enrollments_cohort_staff_select on public.enrollments
  for select using (
    exists (
      select 1 from public.cohort_roles cr
      where cr.user_id = auth.uid()
        and cr.cohort_id = enrollments.cohort_id
        and cr.role in ('teacher', 'assistant')
    )
  );

create policy enrollments_platform_staff_select on public.enrollments
  for select using (public.is_platform_staff());

create policy enrollments_insert_staff on public.enrollments
  for insert with check (public.is_platform_staff());

create policy enrollments_update_staff on public.enrollments
  for update using (public.is_platform_staff());

create policy enrollments_delete_staff on public.enrollments
  for delete using (public.is_platform_staff());

-- 5g. class_sessions
drop policy if exists class_sessions_select on public.class_sessions;

create policy class_sessions_select on public.class_sessions
  for select using (
    public.has_cohort_access(cohort_id)
    or public.is_platform_staff()
  );

create policy class_sessions_insert_staff on public.class_sessions
  for insert with check (public.is_platform_staff());

create policy class_sessions_update_staff on public.class_sessions
  for update using (public.is_platform_staff());

create policy class_sessions_delete_staff on public.class_sessions
  for delete using (public.is_platform_staff());

-- 5h. video_progress
drop policy if exists video_progress_student_select on public.video_progress;
drop policy if exists video_progress_student_insert on public.video_progress;
drop policy if exists video_progress_student_update on public.video_progress;
drop policy if exists video_progress_staff_select on public.video_progress;

create policy video_progress_own_select on public.video_progress
  for select using (
    enrollment_id in (
      select e.id from public.enrollments e
      where e.student_id = auth.uid()
    )
  );

create policy video_progress_own_insert on public.video_progress
  for insert with check (
    enrollment_id in (
      select e.id from public.enrollments e
      where e.student_id = auth.uid()
    )
  );

create policy video_progress_own_update on public.video_progress
  for update using (
    enrollment_id in (
      select e.id from public.enrollments e
      where e.student_id = auth.uid()
    )
  );

create policy video_progress_cohort_staff_select on public.video_progress
  for select using (
    enrollment_id in (
      select e.id from public.enrollments e
      where public.is_cohort_staff(e.cohort_id)
    )
  );

create policy video_progress_platform_staff_select on public.video_progress
  for select using (public.is_platform_staff());

-- 5i. lesson_resources
drop policy if exists lesson_resources_authenticated_select on public.lesson_resources;
drop policy if exists lesson_resources_staff_insert on public.lesson_resources;
drop policy if exists lesson_resources_staff_update on public.lesson_resources;
drop policy if exists lesson_resources_staff_delete on public.lesson_resources;

create policy lesson_resources_select on public.lesson_resources
  for select using (auth.uid() is not null);

create policy lesson_resources_insert_staff on public.lesson_resources
  for insert with check (
    exists (
      select 1 from public.lessons l
      inner join public.program_modules pm on pm.id = l.module_id
      inner join public.cohorts c on c.program_id = pm.program_id
      where l.id = lesson_resources.lesson_id
        and public.is_cohort_staff(c.id)
    )
    or public.is_platform_staff()
  );

create policy lesson_resources_update_staff on public.lesson_resources
  for update using (
    exists (
      select 1 from public.lessons l
      inner join public.program_modules pm on pm.id = l.module_id
      inner join public.cohorts c on c.program_id = pm.program_id
      where l.id = lesson_resources.lesson_id
        and public.is_cohort_staff(c.id)
    )
    or public.is_platform_staff()
  );

create policy lesson_resources_delete_staff on public.lesson_resources
  for delete using (public.is_platform_staff());

-- 5j. cohort_roles
create policy cohort_roles_own_select on public.cohort_roles
  for select using (user_id = auth.uid());

create policy cohort_roles_staff_select on public.cohort_roles
  for select using (public.is_platform_staff());

create policy cohort_roles_admin_insert on public.cohort_roles
  for insert with check (public.is_platform_staff());

create policy cohort_roles_admin_update on public.cohort_roles
  for update using (public.is_admin());

create policy cohort_roles_admin_delete on public.cohort_roles
  for delete using (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- PASO 6: trigger de sincronización enrollments → cohort_roles
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.tg_sync_enrollment_to_cohort_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.cohort_roles (user_id, cohort_id, role)
    values (NEW.student_id, NEW.cohort_id, 'student')
    on conflict (user_id, cohort_id, role) do nothing;
  end if;

  if TG_OP = 'DELETE' then
    delete from public.cohort_roles
    where user_id = OLD.student_id
      and cohort_id = OLD.cohort_id
      and role = 'student';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

create trigger trg_enrollment_sync_cohort_role
  after insert or delete on public.enrollments
  for each row execute function public.tg_sync_enrollment_to_cohort_role();
