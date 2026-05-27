-- =============================================================================
-- Capital Academy — Capítulos de lección + índices de búsqueda full-text
-- ADR: docs/adr/0005-ai-features-sobre-video.md
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Tabla lesson_chapters — marcadores de capítulos en el timeline del video
-- ----------------------------------------------------------------------------
create table public.lesson_chapters (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  position_seconds int not null,
  title text not null,
  sort_order int not null default 0,
  is_generated boolean not null default true,
  created_at timestamptz not null default now()
);

create index lesson_chapters_lesson_idx
  on public.lesson_chapters(lesson_id, sort_order);

alter table public.lesson_chapters enable row level security;

create policy lesson_chapters_student_select on public.lesson_chapters
  for select using (
    exists (
      select 1
      from public.lessons l
      inner join public.program_modules pm on pm.id = l.module_id
      inner join public.cohorts c on c.program_id = pm.program_id
      inner join public.enrollments e on e.cohort_id = c.id
      where l.id = lesson_chapters.lesson_id
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );

create policy lesson_chapters_staff_select on public.lesson_chapters
  for select using (public.is_platform_staff());

create policy lesson_chapters_staff_insert on public.lesson_chapters
  for insert with check (public.is_platform_staff());

create policy lesson_chapters_staff_update on public.lesson_chapters
  for update using (public.is_platform_staff());

create policy lesson_chapters_staff_delete on public.lesson_chapters
  for delete using (public.is_platform_staff());

-- ----------------------------------------------------------------------------
-- Búsqueda full-text sobre transcripciones
-- ----------------------------------------------------------------------------
create extension if not exists unaccent;
create extension if not exists pg_trgm;

alter table public.lesson_transcripts
  add column if not exists search_vector tsvector;

create or replace function lesson_transcripts_search_update() returns trigger as $$
begin
  new.search_vector := to_tsvector('spanish', coalesce(unaccent(new.content_text), ''));
  return new;
end;
$$ language plpgsql;

create trigger trg_lesson_transcripts_search
  before insert or update of content_text on public.lesson_transcripts
  for each row execute function lesson_transcripts_search_update();

create index lesson_transcripts_search_idx
  on public.lesson_transcripts using gin(search_vector);

create index lesson_transcripts_trgm_idx
  on public.lesson_transcripts using gin(content_text gin_trgm_ops);
