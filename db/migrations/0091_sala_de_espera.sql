-- 0091 — Sala de espera de las clases en vivo (ADR-0031).
--
-- Quien tiene matrícula activa NO pasa por acá: ya está autorizado y hacerlo
-- esperar sería fricción sin beneficio. Esta tabla existe para el caso contrario:
-- alguien CON CUENTA en la plataforma pero SIN matrícula en esa cohorte —un
-- colega de Capital Inteligente, un alumno de otra generación— que pide entrar y
-- espera a que el docente lo apruebe.
--
-- Decisión de diseño que sostiene todo lo demás: **quien espera no entra a la
-- sala de LiveKit**. Se queda en una pantalla aparte y el token se emite recién
-- al aprobarlo. Meterlo con permisos recortados lo dejaría dentro, con presencia
-- visible y con un canal de datos abierto; así, alguien sin permiso jamás toca
-- la sala.

create table if not exists public.room_join_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,

  -- Una sola solicitud por persona y clase: volver a pedir REUTILIZA la fila en
  -- vez de acumular. Sin esto, alguien que pulsa el botón cinco veces le llena
  -- la lista al docente con cinco entradas suyas.
  unique (session_id, user_id)
);

create index if not exists room_join_requests_pendientes_idx
  on public.room_join_requests (session_id)
  where status = 'pending';

alter table public.room_join_requests enable row level security;

-- Cada persona ve SOLO sus propias solicitudes. La lista completa (la que ve el
-- docente) se sirve por service_role desde la API, que ya valida que quien
-- pregunta es staff de ESA cohorte: la RLS no sabe de sesiones ni de cohortes,
-- y armar ese join acá sería duplicar —y arriesgarse a que diverja— el gate que
-- ya vive en `decideRoomAccess`.
drop policy if exists room_join_requests_select_own on public.room_join_requests;
create policy room_join_requests_select_own
  on public.room_join_requests for select
  using (user_id = auth.uid());

-- Nadie escribe directo: crear y decidir pasan por la API, que es donde está la
-- autorización. Sin policies de insert/update/delete, el cliente no puede
-- aprobarse a sí mismo aunque conozca la tabla.

comment on table public.room_join_requests is
  'Sala de espera de una clase en vivo (0091): solicitudes de quien tiene cuenta pero no matrícula en esa cohorte. El docente aprueba o rechaza; el token se emite recién al aprobar.';
