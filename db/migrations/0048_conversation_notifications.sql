-- =============================================================================
-- Conversaciones — Iteración 3: notificaciones + realtime.  ADR-0011.
--
-- Tabla de notificaciones in-app + trigger de "respuesta" (notifica al autor del
-- hilo cuando le comentan) + habilitación de Realtime en notificaciones y
-- comentarios. Las menciones y el email se crean desde la app (ruta POST).
--
-- Aditiva y segura: nada existente la usa hasta desplegar el código nuevo.
-- =============================================================================

create table if not exists public.conversation_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,     -- destinatario
  actor_id uuid references public.profiles(id) on delete set null,            -- quien la gatilló
  type text not null check (type in ('reply', 'mention')),
  thread_id uuid references public.conversation_threads(id) on delete cascade,
  comment_id uuid references public.conversation_comments(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists conversation_notifications_user_idx
  on public.conversation_notifications(user_id, created_at desc);
create index if not exists conversation_notifications_unread_idx
  on public.conversation_notifications(user_id) where read_at is null;

alter table public.conversation_notifications enable row level security;

-- El destinatario lee y marca leídas las suyas. Los INSERT los hace el sistema
-- (trigger security-definer para 'reply'; service-role para 'mention'), no el
-- cliente autenticado → no hay policy de insert para authenticated.
drop policy if exists conversation_notifications_select on public.conversation_notifications;
create policy conversation_notifications_select on public.conversation_notifications
  for select using (user_id = auth.uid());

drop policy if exists conversation_notifications_update on public.conversation_notifications;
create policy conversation_notifications_update on public.conversation_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Trigger: al comentar, notifica al autor del hilo (si no es el mismo que comenta).
-- Simple e idempotente; no debe romper el insert del comentario.
create or replace function public.tg_conversation_reply_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_author uuid;
begin
  select author_id into v_author
    from public.conversation_threads
    where id = new.thread_id;

  if v_author is not null and v_author <> new.author_id then
    insert into public.conversation_notifications (user_id, actor_id, type, thread_id, comment_id)
    values (v_author, new.author_id, 'reply', new.thread_id, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_conversation_reply_notification on public.conversation_comments;
create trigger trg_conversation_reply_notification
  after insert on public.conversation_comments
  for each row execute function public.tg_conversation_reply_notification();

-- Realtime: la RLS filtra qué recibe cada quien (notificaciones propias; comentarios
-- de hilos accesibles por programa). Idempotente ante re-corridas.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'conversation_notifications'
  ) then
    alter publication supabase_realtime add table public.conversation_notifications;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'conversation_comments'
  ) then
    alter publication supabase_realtime add table public.conversation_comments;
  end if;
end $$;
