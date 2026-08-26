-- =============================================================================
-- Capital Academy — Gestor de leads: etapa, historial de contacto y tareas.
--
-- Problema: `/admin/leads` es de solo lectura. Comercial ve el lead, descarga un
-- XLSX y anota a mano en la planilla a quién llamó y a quién tiene que volver a
-- llamar. El XLSX es un SNAPSHOT: la descarga del día siguiente trae los leads
-- nuevos pero pierde todo lo anotado en la anterior, así que el trabajo real
-- (el seguimiento) vive fuera del sistema y se copia a mano entre planillas.
-- Es el problema que levantó la conversación del 26-ago, con la campaña del
-- Diplomado saliendo la semana siguiente.
--
-- El CRM de la empresa no cubre esto: está armado para gestión comercial
-- inmobiliaria y no maneja `program_interest`, `lidera_equipo`,
-- `personas_a_cargo` ni `desafios` (las columnas de la 0103). Ver ADR-0038.
--
-- Esta migración agrega las tres piezas que faltan:
--
--   1. `leads.stage`   — en qué punto del embudo está el lead.
--   2. `lead_activity` — lo que YA pasó (nota, llamada, correo, WhatsApp,
--                        cambio de etapa). Append-only.
--   3. `lead_tasks`    — lo que VA a pasar ("llamar mañana 11:00").
--
-- Dos tablas y no una a propósito: una nota no tiene vencimiento y una tarea no
-- es un hecho ocurrido. Juntarlas obliga a un `due_at` nullable cuyo significado
-- cambia según la fila, que es justo el tipo de columna que después nadie sabe
-- leer sin abrir el código.
--
-- `stage` va como COLUMNA en `leads` y no derivada del último `stage_change`
-- porque el panel filtra y cuenta por ella en cada carga: derivarla sería un
-- `distinct on` por consulta para un dato que cabe en un `text`.
--
-- RLS: las dos tablas nacen habilitadas y SIN policies, igual que `leads`
-- (0074). Son datos de contacto de terceros que no consintieron nada más que
-- ser contactados por el programa; el único camino de lectura y escritura es
-- service_role desde rutas que ya pasaron por `authorizeAdmin()`. Falla cerrado:
-- una consulta desde el navegador con la llave anónima devuelve vacío.
--
-- ADITIVO · idempotente · revertible sin tocar un solo lead existente:
--   drop table lead_activity, lead_tasks; alter table leads drop column stage;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Etapa del lead
-- -----------------------------------------------------------------------------
-- Las cinco etapas van fijas en un CHECK y no en una tabla de configuración:
-- cambiarlas es una migración de una línea, mientras que hacerlas configurables
-- es una pantalla de administración que nadie pidió. `descartado` y
-- `matriculado` son ambas terminales — el embudo no obliga a pasar por todas.
alter table public.leads
  add column if not exists stage text not null default 'nuevo';

alter table public.leads
  drop constraint if exists leads_stage_check;

alter table public.leads
  add constraint leads_stage_check
  check (stage = any (array['nuevo', 'contactado', 'interesado', 'matriculado', 'descartado']));

comment on column public.leads.stage is
  'Etapa del embudo de captación. Se mueve a mano desde /admin/leads; cada cambio deja un lead_activity de kind=stage_change.';

-- El panel filtra por etapa en cada carga.
create index if not exists leads_stage_idx
  on public.leads using btree (stage);

-- -----------------------------------------------------------------------------
-- 2. Historial de contacto (append-only)
-- -----------------------------------------------------------------------------
create table if not exists public.lead_activity (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  kind       text not null,
  outcome    text,
  body       text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,

  constraint lead_activity_kind_check
    check (kind = any (array['note', 'call', 'email', 'whatsapp', 'stage_change'])),

  -- El resultado solo tiene sentido para una llamada; para el resto es ruido.
  constraint lead_activity_outcome_check
    check (
      outcome is null
      or (kind = 'call' and outcome = any (array['answered', 'no_answer', 'wrong_number']))
    ),

  -- Una nota vacía no es una nota. El resto de los tipos SÍ pueden no tener
  -- cuerpo: "le escribí por WhatsApp" es un hecho completo sin texto.
  constraint lead_activity_note_body_check
    check (kind <> 'note' or (body is not null and length(btrim(body)) > 0))
);

comment on table public.lead_activity is
  'Bitácora de contacto de un lead: notas, llamadas, correos, WhatsApp y cambios de etapa. Append-only, nunca se edita.';
comment on column public.lead_activity.outcome is
  'Resultado de la llamada (answered/no_answer/wrong_number). Null en todo lo que no sea kind=call.';
comment on column public.lead_activity.created_by is
  'Quién registró el contacto. Queda en null si esa cuenta se borra: el hecho ocurrió igual.';

-- El detalle del lead pide su historial completo, lo más reciente primero.
create index if not exists lead_activity_lead_idx
  on public.lead_activity using btree (lead_id, created_at desc);

alter table public.lead_activity enable row level security;

-- -----------------------------------------------------------------------------
-- 3. Tareas con vencimiento
-- -----------------------------------------------------------------------------
create table if not exists public.lead_tasks (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  title      text not null,
  due_at     timestamptz not null,
  done_at    timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,

  constraint lead_tasks_title_check
    check (length(btrim(title)) > 0)
);

comment on table public.lead_tasks is
  'Próximo paso agendado sobre un lead ("llamar mañana 11:00"). done_at null = pendiente.';
comment on column public.lead_tasks.created_by is
  'A quién le avisa el digest diario. Sin dueño no hay a quién avisarle, así que una tarea huérfana queda solo en pantalla.';

-- Índice PARCIAL: tanto la franja de pendientes del panel como el digest diario
-- preguntan siempre por tareas sin terminar ordenadas por vencimiento. Las
-- hechas no se consultan nunca por fecha y solo engordarían el índice.
create index if not exists lead_tasks_pendientes_idx
  on public.lead_tasks using btree (due_at)
  where done_at is null;

-- El detalle del lead lista sus tareas (pendientes y hechas).
create index if not exists lead_tasks_lead_idx
  on public.lead_tasks using btree (lead_id, due_at desc);

alter table public.lead_tasks enable row level security;

-- -----------------------------------------------------------------------------
-- 4. Cambio de etapa: mover y registrar en una sola operación
-- -----------------------------------------------------------------------------
-- Mover la etapa y anotar el movimiento son dos escrituras que tienen que
-- ocurrir juntas o no ocurrir. Hechas desde la aplicación quedan sueltas: si la
-- segunda falla, la bitácora miente (o le falta el movimiento, o dice que pasó
-- algo que no pasó). Una función las mete en la misma transacción y de paso
-- deja el route handler sin lógica que equivocar.
--
-- Devuelve la etapa ANTERIOR, que es lo que el panel necesita para revertir en
-- pantalla si la petición falla. Un lead inexistente devuelve null sin escribir
-- nada, y la ruta lo traduce a 404.
--
-- No es SECURITY DEFINER: la llama el service_role desde una ruta que ya pasó
-- por `authorizeAdmin()`, así que no necesita saltarse la RLS de nadie. Dejarla
-- INVOKER evita crear un camino privilegiado nuevo por el que un rol con menos
-- permisos pueda escribir.
create or replace function public.mover_etapa_lead(
  p_lead_id uuid,
  p_stage   text,
  p_actor   uuid,
  p_detalle text
)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_anterior text;
begin
  select stage into v_anterior
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    return null;
  end if;

  -- Mover a la etapa en que ya está no es un movimiento: no ensucia la
  -- bitácora con filas que no dicen nada.
  if v_anterior = p_stage then
    return v_anterior;
  end if;

  update public.leads set stage = p_stage where id = p_lead_id;

  insert into public.lead_activity (lead_id, kind, body, created_by)
  values (p_lead_id, 'stage_change', p_detalle, p_actor);

  return v_anterior;
end;
$$;

comment on function public.mover_etapa_lead is
  'Cambia leads.stage y deja el lead_activity del movimiento en la misma transacción. Devuelve la etapa anterior, o null si el lead no existe.';
