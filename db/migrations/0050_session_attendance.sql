-- =============================================================================
-- Capital Academy — Registro de asistencia por QR a clases en vivo
--
-- Cada clase en vivo (class_sessions) genera un QR fijo que apunta a
-- /asistencia/<sessionId>. El alumno lo escanea, inicia sesión si hace falta y
-- registra su asistencia con un tap. La escritura NO la hace `authenticated`:
-- la Server Action valida matrícula activa + ventana temporal y escribe con
-- service_role (mismo patrón que class_sessions / session_resources). Por eso
-- esta tabla solo declara policy de SELECT.
--
-- Helpers usados: public.is_cohort_staff(uuid) e public.is_platform_staff() (0007).
-- `method`:  'qr'     → auto-registro del alumno desde el check-in público.
--            'manual' → marcado por staff (marked_by = profiles.id del staff).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Tabla session_attendance
-- ----------------------------------------------------------------------------
create table public.session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  marked_at timestamptz not null default now(),
  method text not null default 'qr' check (method in ('qr', 'manual')),
  marked_by uuid references public.profiles(id) on delete set null, -- null = self; staff.id si manual
  unique (session_id, student_id)
);

create index session_attendance_session_idx on public.session_attendance(session_id);
create index session_attendance_student_idx on public.session_attendance(student_id);
create index session_attendance_cohort_idx on public.session_attendance(cohort_id);

-- ----------------------------------------------------------------------------
-- RLS: solo SELECT para authenticated (dueño + staff de cohorte + staff global).
-- Las escrituras van por service_role desde la Server Action.
-- ----------------------------------------------------------------------------
alter table public.session_attendance enable row level security;

create policy session_attendance_select on public.session_attendance
  for select using (
    student_id = auth.uid()
    or public.is_cohort_staff(cohort_id)
    or public.is_platform_staff()
  );
