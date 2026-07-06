-- =============================================================================
-- Conversaciones — Iteración 2: guardar hilos (bookmarks).
--
-- El usuario guarda hilos para volver a ellos ("Guardados"). Tabla propia,
-- clave (user_id, thread_id). RLS: cada usuario gestiona solo los suyos. El
-- aislamiento por programa lo aporta la RLS de conversation_threads al listar
-- (un bookmark a un hilo que no puede ver no muestra nada).
--
-- Aditiva y segura: ninguna funcionalidad existente la usa hasta desplegar el
-- código nuevo.
-- =============================================================================

create table if not exists public.conversation_bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.conversation_threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);

create index if not exists conversation_bookmarks_user_idx
  on public.conversation_bookmarks(user_id, created_at desc);

alter table public.conversation_bookmarks enable row level security;

drop policy if exists conversation_bookmarks_select on public.conversation_bookmarks;
create policy conversation_bookmarks_select on public.conversation_bookmarks
  for select using (user_id = auth.uid());

drop policy if exists conversation_bookmarks_insert on public.conversation_bookmarks;
create policy conversation_bookmarks_insert on public.conversation_bookmarks
  for insert with check (user_id = auth.uid());

drop policy if exists conversation_bookmarks_delete on public.conversation_bookmarks;
create policy conversation_bookmarks_delete on public.conversation_bookmarks
  for delete using (user_id = auth.uid());
