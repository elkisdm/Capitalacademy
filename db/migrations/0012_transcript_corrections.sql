-- =============================================================================
-- Capital Academy — Corrección de transcripciones con IA
-- Pipeline: transcript crudo (Mux/Whisper) → gpt-5.4-mini → texto corregido
-- Segmentos individuales para edición granular por admin
-- =============================================================================

-- Campos de corrección en lesson_transcripts
alter table public.lesson_transcripts
  add column if not exists corrected_text text,
  add column if not exists corrected_vtt text,
  add column if not exists correction_status text not null default 'pending',
  add column if not exists segments_needing_review int not null default 0;

-- Tabla de segmentos individuales (parseados del VTT)
create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.lesson_transcripts(id) on delete cascade,
  segment_index int not null,
  start_seconds numeric(10,3) not null,
  end_seconds numeric(10,3) not null,
  original_text text not null,
  corrected_text text,
  needs_review boolean not null default false,
  review_reason text,
  manually_edited boolean not null default false,
  edited_by uuid references public.profiles(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),

  unique (transcript_id, segment_index)
);

create index transcript_segments_transcript_idx
  on public.transcript_segments(transcript_id, segment_index);

create index transcript_segments_review_idx
  on public.transcript_segments(needs_review)
  where needs_review = true;

alter table public.transcript_segments enable row level security;

create policy transcript_segments_student_select on public.transcript_segments
  for select using (
    exists (
      select 1
      from public.lesson_transcripts lt
      inner join public.lessons l on l.id = lt.lesson_id
      inner join public.program_modules pm on pm.id = l.module_id
      inner join public.cohorts c on c.program_id = pm.program_id
      inner join public.enrollments e on e.cohort_id = c.id
      where lt.id = transcript_segments.transcript_id
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );

create policy transcript_segments_staff_select on public.transcript_segments
  for select using (public.is_platform_staff());

create policy transcript_segments_staff_insert on public.transcript_segments
  for insert with check (public.is_platform_staff());

create policy transcript_segments_staff_update on public.transcript_segments
  for update using (public.is_platform_staff());
