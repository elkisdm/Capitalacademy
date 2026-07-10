-- =============================================================================
-- Capital Academy — Módulo Entregables (tareas con ventana de entrega).
--
-- Es el inverso de `lesson_resources`: en vez de que el staff publique
-- material para que el alumno descargue, el staff crea una tarea (`deliverables`,
-- program-scoped) con una ventana [opens_at, due_at] y cada alumno con matrícula
-- activa sube su(s) archivo(s) (`deliverable_submissions`, 1 fila = 1 archivo)
-- dentro de esa ventana.
--
-- Reutiliza patrones ya en producción:
--   - RLS con has_program_access/is_program_staff (0044) e is_platform_staff (0007).
--   - Bucket privado + signed URLs firmadas server-side (lesson-resources 0034,
--     certificates 0029). Bucket propio (`deliverables`) en vez de un prefijo
--     dentro de `lesson-resources`: el path es student-scoped y la semántica de
--     propiedad difiere; un bucket propio evita colisiones de RLS/semántica.
--   - Idempotencia del correo de apertura vía reserva-antes-de-enviar en la
--     columna `open_notified_at` (mismo criterio que session_reminders/0051).
--
-- Diseño de tablas: `deliverable_submissions` es 1 fila = 1 archivo (no un
-- envelope submission + files). Es más simple y basta para derivar el estado
-- pendiente/entregado/fuera-de-plazo. Si más adelante se necesita un
-- submitted_at único o feedback/nota por entrega, migrar a un envelope.
-- NO hay unique parcial para "un solo archivo cuando allow_multiple=false": esa
-- unicidad la garantiza la API (borra+inserta), igual que otros flujos del repo.
--
-- TODO ADITIVO · idempotente · reversible (no borra columnas ni datos).
-- NO se aplica a prod en este ciclo: se ejecuta vía Supabase CLI cuando
-- corresponda (incluye la creación del bucket, ver paso 1).
-- =============================================================================

-- 1. Bucket privado, límite 50 MB. allowed_mime_types NULL: la validación de
--    tipo/tamaño la hace la API (categorías pdf/word/excel/image), no el bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deliverables', 'deliverables', false, 52428800, null)
on conflict (id) do update
  set public = false,
      file_size_limit = 52428800,
      allowed_mime_types = null;

-- 2. Tarea (entregable) a nivel de programa.
create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  title text not null,
  description text,
  opens_at timestamptz not null,
  due_at timestamptz not null,
  allowed_file_types text[] not null default '{pdf,word,excel,image}',
  max_file_size_bytes integer not null default 52428800
    check (max_file_size_bytes > 0 and max_file_size_bytes <= 52428800),
  allow_multiple boolean not null default false,
  open_notified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliverables_window_chk check (due_at > opens_at),
  constraint deliverables_ftypes_chk check (
    allowed_file_types <@ array['pdf','word','excel','image']::text[]
    and array_length(allowed_file_types, 1) >= 1
  )
);

create index deliverables_program_opens_idx on public.deliverables(program_id, opens_at);
-- Cola de aperturas pendientes de notificar (leída por el cron cada 30 min).
create index deliverables_pending_notify_idx on public.deliverables(opens_at)
  where open_notified_at is null;

create trigger trg_deliverables_updated_at
  before update on public.deliverables
  for each row execute function public.tg_set_updated_at();

-- 3. Entrega del alumno: 1 fila = 1 archivo subido.
create table public.deliverable_submissions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references public.deliverables(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  content_type text,
  file_size_bytes integer,
  uploaded_at timestamptz not null default now()
);

create index deliverable_submissions_deliverable_idx
  on public.deliverable_submissions(deliverable_id, student_id);
create index deliverable_submissions_student_idx
  on public.deliverable_submissions(student_id);

-- 4. RLS.
alter table public.deliverables enable row level security;
alter table public.deliverable_submissions enable row level security;

drop policy if exists deliverables_select on public.deliverables;
create policy deliverables_select on public.deliverables
  for select using (public.has_program_access(program_id));

drop policy if exists deliverables_staff_all on public.deliverables;
create policy deliverables_staff_all on public.deliverables
  for all using (public.is_program_staff(program_id))
  with check (public.is_program_staff(program_id));

drop policy if exists deliverable_submissions_select_own on public.deliverable_submissions;
create policy deliverable_submissions_select_own on public.deliverable_submissions
  for select using (auth.uid() = student_id);

drop policy if exists deliverable_submissions_select_staff on public.deliverable_submissions;
create policy deliverable_submissions_select_staff on public.deliverable_submissions
  for select using (exists (
    select 1 from public.deliverables d
    where d.id = deliverable_submissions.deliverable_id
      and public.is_program_staff(d.program_id)
  ));

drop policy if exists deliverable_submissions_insert_own on public.deliverable_submissions;
create policy deliverable_submissions_insert_own on public.deliverable_submissions
  for insert with check (
    auth.uid() = student_id
    and exists (
      select 1 from public.deliverables d
      where d.id = deliverable_submissions.deliverable_id
        and public.has_program_access(d.program_id)
        and now() >= d.opens_at
        and now() <= d.due_at
    )
  );

drop policy if exists deliverable_submissions_delete_own on public.deliverable_submissions;
create policy deliverable_submissions_delete_own on public.deliverable_submissions
  for delete using (
    auth.uid() = student_id
    and exists (
      select 1 from public.deliverables d
      where d.id = deliverable_submissions.deliverable_id
        and now() >= d.opens_at
        and now() <= d.due_at
    )
  );
