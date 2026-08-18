-- 0099 — Salas abiertas a invitados sin cuenta (ADR-0035).
--
-- Hasta acá, entrar a una sala exigía SIEMPRE una cuenta: `/sala/[code]` manda a
-- login a quien no tenga sesión, y como no existe registro público, un externo
-- llegaba a una puerta que nunca se le iba a abrir. Esto habilita el camino
-- faltante, pero SOLO donde alguien lo encienda a propósito.
--
-- Dos decisiones sostienen el diseño:
--
-- 1. **El flag es por sesión y nace apagado.** Ninguna clase existente cambia de
--    comportamiento al aplicar esta migración. Que un enlace se filtre no sirve
--    de nada si la sala de esa clase no admite invitados.
-- 2. **El invitado pasa por la sala de espera igual que en 0091.** Escribe su
--    nombre, queda pendiente y NO recibe token hasta que el docente lo acepta.
--    Quien espera no toca la sala de LiveKit.

alter table public.class_sessions
  add column if not exists guest_access boolean not null default false;

comment on column public.class_sessions.guest_access is
  'Si es true, alguien SIN cuenta puede pedir entrar a esta sala escribiendo su nombre (0099). Nace en false: encenderlo es un acto deliberado por clase.';

-- Solicitudes de quien NO tiene cuenta. Deliberadamente separada de
-- `room_join_requests` (0091): esa tabla exige `user_id not null references
-- profiles(id)` y su RLS se apoya en `auth.uid()`. Un invitado no tiene ninguna
-- de las dos cosas. Volver `user_id` nullable debilitaría una invariante hoy
-- simple y dejaría aquella policy a medias; separar contiene el riesgo nuevo en
-- una superficie nueva.
create table if not exists public.room_guests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions(id) on delete cascade,

  -- Lo único que el invitado aporta de sí mismo. Se sanea en la API (largo y
  -- caracteres de control); el CHECK acá es la última línea, no la primera.
  display_name text not null check (length(btrim(display_name)) between 2 and 40),

  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null
);

-- El `id` de esta fila ES la credencial del invitado: viaja en una cookie
-- httpOnly y es lo único que lo identifica después. Por eso es un UUID (no
-- adivinable) y por eso la tabla no la lee nadie salvo `service_role`.
comment on table public.room_guests is
  'Sala de espera de invitados SIN cuenta (0099). El id de la fila viaja en cookie httpOnly y es la credencial del invitado; el token se emite recién al aprobarlo.';

create index if not exists room_guests_pendientes_idx
  on public.room_guests (session_id)
  where status = 'pending';

alter table public.room_guests enable row level security;

-- SIN policies, a propósito y de forma más estricta que en 0091: un invitado no
-- tiene `auth.uid()`, así que no hay identidad de Supabase sobre la cual escribir
-- una policy honesta. Todo —crear, consultar y decidir— pasa por la API, que es
-- donde vive la autorización real (flag de la sala, ventana horaria y staff de
-- ESA cohorte).

-- Reversa:
--   drop table if exists public.room_guests;
--   alter table public.class_sessions drop column if exists guest_access;
