-- 0094 — Aviso a los alumnos cuando una clase se mueve o se cancela.
--
-- Hoy no existe: cambiar el horario de una clase o borrarla no le dice nada a
-- nadie. Y el hueco es peor de lo que parece porque los recordatorios NO se
-- reenvían — la bitácora `session_reminders` es por (clase, ventana) y una vez
-- que salió el de 24 h no vuelve a salir. Si la clase se mueve después de eso,
-- el alumno se queda con la hora vieja en su bandeja y nadie se lo corrige.
--
-- El aviso NO es automático: lo confirma quien edita, viendo a cuántos alcanza.
-- Reacomodar el calendario de una cohorte mueve varias clases seguidas, y un
-- disparo automático mandaría una tanda de correos por cada una; además hay
-- ajustes internos (corregir un typo en la hora de término) que no vale la pena
-- comunicar. La decisión es de quien conoce el contexto, no del sistema.
--
-- Esta tabla es la bitácora de esos avisos (ADR-0020): quién avisó, de qué y a
-- cuántos. Sirve para responder "¿le avisamos a la G4 que la clase se corrió?"
-- sin depender de la memoria de nadie.

create table if not exists public.session_change_notices (
  id uuid primary key default gen_random_uuid(),
  -- Se conserva el título por si la clase se borra: para una cancelación, la
  -- fila de class_sessions deja de existir justo después del aviso.
  session_id uuid references public.class_sessions(id) on delete set null,
  session_title text not null,
  cohort_id uuid not null references public.cohorts(id) on delete cascade,

  kind text not null,
  -- Horario que tenían los alumnos cuando se les avisó. Es el dato que vuelve
  -- interpretable el aviso ("estaba para el sábado a las 10").
  previous_starts_at timestamptz not null,
  previous_ends_at timestamptz not null,
  -- Nulos en una cancelación: no hay horario nuevo.
  new_starts_at timestamptz,
  new_ends_at timestamptz,
  motivo text,

  recipients_count integer not null default 0,
  sent_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint session_change_notices_kind_chk
    check (kind in ('rescheduled', 'cancelled')),
  -- Una reprogramación sin horario nuevo no se puede redactar; una cancelación
  -- con horario nuevo es una contradicción.
  constraint session_change_notices_horario_chk
    check (
      (kind = 'rescheduled' and new_starts_at is not null and new_ends_at is not null)
      or (kind = 'cancelled' and new_starts_at is null and new_ends_at is null)
    )
);

create index if not exists session_change_notices_session_idx
  on public.session_change_notices (session_id, created_at desc);
create index if not exists session_change_notices_cohort_idx
  on public.session_change_notices (cohort_id, created_at desc);

alter table public.session_change_notices enable row level security;

-- Solo lectura para el equipo; toda escritura pasa por service_role desde la
-- ruta, igual que el resto de las bitácoras de envío.
drop policy if exists session_change_notices_staff_read on public.session_change_notices;
create policy session_change_notices_staff_read
  on public.session_change_notices
  for select
  using (public.is_platform_staff());
