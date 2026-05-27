-- =============================================================================
-- Capital Academy — Transcripciones de lecciones
-- Almacena transcriptos (texto plano + WebVTT) generados desde Mux.
-- ADR: docs/adr/0005-transcripciones-lecciones.md
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Columna mux_track_id en lessons (referencia al track de subtítulos en Mux)
-- ----------------------------------------------------------------------------
alter table public.lessons
  add column if not exists mux_track_id text;

-- ----------------------------------------------------------------------------
-- Tabla lesson_transcripts
-- ----------------------------------------------------------------------------
create table public.lesson_transcripts (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  content_text text,            -- transcripción en texto plano
  content_vtt text,             -- WebVTT con marcas de tiempo
  language text not null default 'es',
  status text not null default 'pending',  -- pending | processing | ready | failed
  error_message text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (lesson_id, language)
);

-- trigger updated_at (reutiliza la función genérica de 0001)
create trigger trg_lesson_transcripts_updated_at
  before update on public.lesson_transcripts
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- Índices
-- ----------------------------------------------------------------------------
create index lesson_transcripts_lesson_idx
  on public.lesson_transcripts(lesson_id);

create index lesson_transcripts_status_idx
  on public.lesson_transcripts(status)
  where status != 'ready';

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.lesson_transcripts enable row level security;

-- Alumno matriculado en una cohorte cuyo programa contiene la lección
create policy lesson_transcripts_student_select on public.lesson_transcripts
  for select using (
    exists (
      select 1
      from public.lessons l
      inner join public.program_modules pm on pm.id = l.module_id
      inner join public.cohorts c on c.program_id = pm.program_id
      inner join public.enrollments e on e.cohort_id = c.id
      where l.id = lesson_transcripts.lesson_id
        and e.student_id = auth.uid()
        and e.status = 'active'
    )
  );

-- Staff de plataforma (ops, admin) puede leer, insertar y actualizar
create policy lesson_transcripts_staff_select on public.lesson_transcripts
  for select using (public.is_platform_staff());

create policy lesson_transcripts_staff_insert on public.lesson_transcripts
  for insert with check (public.is_platform_staff());

create policy lesson_transcripts_staff_update on public.lesson_transcripts
  for update using (public.is_platform_staff());
