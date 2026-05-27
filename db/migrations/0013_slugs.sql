-- =============================================================================
-- Capital Academy — Slugs para URLs legibles en el classroom
-- Reemplaza UUIDs en URLs por slugs derivados del nombre/título
-- =============================================================================

alter table public.cohorts add column if not exists slug text;
alter table public.program_modules add column if not exists slug text;
alter table public.lessons add column if not exists slug text;

create unique index if not exists cohorts_slug_idx
  on public.cohorts(slug) where slug is not null;
create unique index if not exists program_modules_slug_idx
  on public.program_modules(slug) where slug is not null;
create unique index if not exists lessons_slug_idx
  on public.lessons(slug) where slug is not null;

update public.cohorts
  set slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
  where slug is null;
update public.program_modules
  set slug = lower(regexp_replace(regexp_replace(title, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
  where slug is null;
update public.lessons
  set slug = lower(regexp_replace(regexp_replace(title, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
  where slug is null;
