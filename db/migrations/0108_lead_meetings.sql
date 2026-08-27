-- =============================================================================
-- Capital Academy — La tarea de un lead puede ser una reunión real en Google.
--
-- ADR: docs/adr/0039-agendar-reuniones-con-leads.md
-- Spec: docs/specs/agendar-reunion-con-lead.md
--
-- Hasta ahora "Próximos pasos" solo agenda un recordatorio INTERNO: nadie fuera
-- del equipo se entera. La reunión con el prospecto se sigue coordinando por
-- fuera y no existe en ninguna agenda hasta que alguien la crea a mano.
--
-- Una reunión ES un próximo paso con hora, así que va como columnas sobre
-- `lead_tasks` y no como tabla nueva: la franja de pendientes y el digest diario
-- la cubren sin una línea de código extra. Una tabla aparte duplicaría el
-- concepto de "lo que viene" y obligaría a unir dos fuentes en cada pantalla.
--
-- El evento vive en Google; acá solo se guarda el puntero. `google_event_id` es
-- lo que permite borrar el evento cuando se borra la tarea: sin él, cancelar en
-- la plataforma dejaría fantasmas en la agenda de la profesora.
--
-- ADITIVO · idempotente · toda tarea existente queda como `kind = 'task'`.
-- =============================================================================

alter table public.lead_tasks
  add column if not exists kind text not null default 'task',
  add column if not exists duration_minutes integer,
  add column if not exists google_event_id text,
  add column if not exists meet_url text,
  add column if not exists sync_error text;

alter table public.lead_tasks
  drop constraint if exists lead_tasks_kind_check;

alter table public.lead_tasks
  add constraint lead_tasks_kind_check
  check (kind = any (array['task', 'meeting']));

-- Una reunión sin duración no se puede agendar; un recordatorio no la necesita.
--
-- El `is not null` explícito NO es redundante: `null between 5 and 480` evalúa a
-- NULL, no a false, y un CHECK solo rechaza la fila cuando da FALSE. Sin él, una
-- reunión sin duración entraba a la tabla sin que nadie se enterara — verificado
-- contra Postgres 16 antes de escribir esta línea.
alter table public.lead_tasks
  drop constraint if exists lead_tasks_duration_check;

alter table public.lead_tasks
  add constraint lead_tasks_duration_check
  check (
    (kind = 'task' and duration_minutes is null)
    or (
      kind = 'meeting'
      and duration_minutes is not null
      and duration_minutes between 5 and 480
    )
  );

-- Un recordatorio interno no tiene evento en Google. Sin esto, una tarea
-- `task` con `google_event_id` sería un puntero que nadie borra nunca.
alter table public.lead_tasks
  drop constraint if exists lead_tasks_evento_solo_en_reunion_check;

alter table public.lead_tasks
  add constraint lead_tasks_evento_solo_en_reunion_check
  check (kind = 'meeting' or (google_event_id is null and meet_url is null));

comment on column public.lead_tasks.kind is
  'task = recordatorio interno; meeting = reunión real en el calendario de la profesora, con invitación al lead.';
comment on column public.lead_tasks.google_event_id is
  'Id del evento en Google. Null en una reunión que todavía no llegó al calendario (ver sync_error).';
comment on column public.lead_tasks.meet_url is
  'Enlace de Meet que generó Google al crear el evento.';
comment on column public.lead_tasks.sync_error is
  'Por qué esta reunión no llegó al calendario. Null = sincronizada. Existe para que el panel NUNCA muestre como agendado algo que no lo está.';

-- El borrado del lead tiene que arrastrar los eventos de Google, y para eso hay
-- que poder listarlos antes de borrar. Índice parcial: solo las reuniones que
-- realmente tienen evento.
create index if not exists lead_tasks_google_event_idx
  on public.lead_tasks using btree (google_event_id)
  where google_event_id is not null;
