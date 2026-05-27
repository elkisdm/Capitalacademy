-- =============================================================================
-- Capital Academy — Resúmenes de lecciones generados con IA
-- Pipeline: transcript (Mux) → OpenAI gpt-5.4-mini → resumen estructurado
-- ADR: docs/adr/0005-ai-features-sobre-video.md
-- =============================================================================

create table public.lesson_summaries (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,

  key_points jsonb not null default '[]',
  summary_text text not null default '',
  glossary jsonb not null default '[]',

  model_used text not null default 'gpt-5.4-mini',
  prompt_version int not null default 1,
  generation_count int not null default 1,
  is_manually_edited boolean not null default false,

  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (lesson_id)
);

create trigger trg_lesson_summaries_updated_at
  before update on public.lesson_summaries
  for each row execute function public.tg_set_updated_at();

create index lesson_summaries_lesson_idx
  on public.lesson_summaries(lesson_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.lesson_summaries enable row level security;

create policy lesson_summaries_student_select on public.lesson_summaries
  for select using (
    exists (
      select 1
      from public.lessons l
      inner join public.program_modules pm on pm.id = l.module_id
      inner join public.cohorts c on c.program_id = pm.program_id
      inner join public.enrollments e on e.cohort_id = c.id
      where l.id = lesson_summaries.lesson_id
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );

create policy lesson_summaries_staff_select on public.lesson_summaries
  for select using (public.is_platform_staff());

create policy lesson_summaries_staff_insert on public.lesson_summaries
  for insert with check (public.is_platform_staff());

create policy lesson_summaries_staff_update on public.lesson_summaries
  for update using (public.is_platform_staff());
