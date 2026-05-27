-- =============================================================================
-- Capital Academy — Onboarding: columnas de perfil + invitation_log
-- =============================================================================

alter table public.profiles
  add column rut text,
  add column company text,
  add column job_title text,
  add column linkedin_url text,
  add column bio text,
  add column address text,
  add column emergency_contact_name text,
  add column emergency_contact_phone text,
  add column onboarding_completed_at timestamptz;

create index profiles_onboarding_pending_idx
  on public.profiles (id)
  where onboarding_completed_at is null;

create unique index profiles_rut_unique_idx
  on public.profiles (rut)
  where rut is not null;

update public.profiles
  set onboarding_completed_at = now()
  where system_role in ('ops', 'admin');

-- -----------------------------------------------------------------------------
-- invitation_log — registro de invitaciones enviadas a usuarios
-- -----------------------------------------------------------------------------

create table public.invitation_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  sent_at timestamptz not null default now(),
  sent_by uuid references public.profiles(id) on delete set null,
  channel text not null default 'email',
  status text not null default 'sent'
);

create index invitation_log_user_idx on public.invitation_log(user_id);
alter table public.invitation_log enable row level security;

create policy invitation_log_staff_select on public.invitation_log
  for select using (public.is_platform_staff());

create policy invitation_log_staff_insert on public.invitation_log
  for insert with check (public.is_platform_staff());
