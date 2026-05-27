-- =============================================================================
-- Capital Academy — Comentarios en lecciones (threaded)
-- Modelo: comentario raíz + respuestas anidadas (parent_id → self-reference)
-- =============================================================================

create table public.lesson_comments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.lesson_comments(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_lesson_comments_updated_at
  before update on public.lesson_comments
  for each row execute function public.tg_set_updated_at();

create index lesson_comments_lesson_idx
  on public.lesson_comments(lesson_id, created_at);

create index lesson_comments_parent_idx
  on public.lesson_comments(parent_id)
  where parent_id is not null;

alter table public.lesson_comments enable row level security;

create policy lesson_comments_student_select on public.lesson_comments
  for select using (
    exists (
      select 1
      from public.lessons l
      inner join public.program_modules pm on pm.id = l.module_id
      inner join public.cohorts c on c.program_id = pm.program_id
      inner join public.enrollments e on e.cohort_id = c.id
      where l.id = lesson_comments.lesson_id
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );

create policy lesson_comments_student_insert on public.lesson_comments
  for insert with check (
    auth.uid() = author_id
    and exists (
      select 1
      from public.lessons l
      inner join public.program_modules pm on pm.id = l.module_id
      inner join public.cohorts c on c.program_id = pm.program_id
      inner join public.enrollments e on e.cohort_id = c.id
      where l.id = lesson_comments.lesson_id
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );

create policy lesson_comments_author_update on public.lesson_comments
  for update using (auth.uid() = author_id);

create policy lesson_comments_author_delete on public.lesson_comments
  for delete using (auth.uid() = author_id);

create policy lesson_comments_staff_all on public.lesson_comments
  for all using (public.is_platform_staff());
