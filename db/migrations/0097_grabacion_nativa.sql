-- 0097 — Grabación nativa de las clases en vivo (ADR-0034).
--
-- Hoy la repetición depende de que alguien grabe por fuera, descargue el archivo
-- y lo suba con MuxUploader. Esta migración sostiene el camino automático:
-- LiveKit Egress deja un MP4 en un bucket privado, la app lo ingesta a Mux por
-- URL firmada y de ahí en adelante manda la cadena que ya existe (0041).
--
-- El estado vive en una tabla propia y no en `class_sessions` ni en la lección:
-- LiveKit olvida un egress terminado y la lección solo sabe del asset final, así
-- que sin esto no habría forma de decir "esta clase se grabó, el archivo pesó X,
-- la ingesta falló por Y". Mismo criterio que `session_reminder_recipients` (0075).
--
-- ADITIVO · idempotente. Aplicada a prod el 2026-08-12 (vía MCP): es inerte
-- mientras LIVEKIT_EGRESS_ENABLED no esté encendido — RLS sin policies, bucket
-- privado y ninguna escritura hasta que el egress exista.

-- 1. Bucket privado, tope de 8 GB (una clase de 3 h a 720p pesa ~4 GB).
--    Sin policies: solo `service_role`, igual que `certificates` (0029) y
--    `deliverables` (0053). El MP4 tiene caras y voces de alumnos: es PII, y el
--    objeto se borra en cuanto Mux confirma el asset.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grabaciones', 'grabaciones', false, 8589934592, array['video/mp4'])
on conflict (id) do update
  set public = false,
      file_size_limit = 8589934592,
      allowed_mime_types = array['video/mp4'];

-- 2. Una fila por intento de grabación de una clase.
create table if not exists public.session_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,

  -- Lo asigna LiveKit al arrancar el trabajo; es la llave con la que llegan los
  -- webhooks y con la que el cron reconcilia contra ListEgress. Nace NULL porque
  -- la fila se crea ANTES de llamar a Egress: es la reserva que impide que dos
  -- clics simultáneos levanten dos Chrome sobre la misma sala.
  egress_id text unique,

  status text not null default 'starting'
    check (status in ('starting','active','uploaded','ingesting','ready','failed')),

  -- Ruta dentro del bucket `grabaciones`: `<session_id>/<recording_id>.mp4`.
  storage_path text,
  file_size_bytes bigint,
  duration_seconds integer,
  mux_asset_id text,
  -- Motivo legible cuando `status = 'failed'`. Se muestra tal cual en el panel.
  error text,

  started_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ingested_at timestamptz,
  storage_deleted_at timestamptz
);

-- Una sola grabación viva por sala: sin esto, dos clics simultáneos del docente
-- levantan dos trabajos de Egress y producen dos archivos que pelean por la
-- misma lección-repetición.
create unique index if not exists session_recordings_activa_idx
  on public.session_recordings (session_id)
  where status in ('starting','active');

-- El barrido del cron entra por acá: filas que todavía esperan algo.
create index if not exists session_recordings_pendientes_idx
  on public.session_recordings (status, started_at)
  where status in ('starting','active','uploaded','ingesting');

-- La limpieza de objetos (D7) busca por lo que queda en el bucket.
create index if not exists session_recordings_storage_idx
  on public.session_recordings (status, ended_at)
  where storage_path is not null and storage_deleted_at is null;

create index if not exists session_recordings_session_idx
  on public.session_recordings (session_id, started_at desc);

-- RLS activa y SIN policies a propósito: nadie lee ni escribe esta tabla
-- directo. La API sirve el estado y ya verifica que quien pregunta es docente de
-- ESA cohorte (decideRoomAccess); duplicar ese join en una policy sería
-- arriesgarse a que diverja del gate real.
alter table public.session_recordings enable row level security;

comment on table public.session_recordings is
  'Grabación nativa de una clase en vivo vía LiveKit Egress (ADR-0034). Escrita solo por service_role.';
