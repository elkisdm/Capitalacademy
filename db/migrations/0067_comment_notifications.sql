-- =============================================================================
-- Capital Academy — Notificaciones unificadas de comentarios. ADR-0014.
-- Generaliza conversation_notifications (0048) para cubrir comentarios de LECCIÓN
-- reusando campana + Realtime. Extiende el trigger de reply del foro para
-- notificar también al autor del comentario padre (dedupe).
-- =============================================================================

-- 1) Objetivo de lección (nullable; thread_id/comment_id siguen para el foro).
alter table public.conversation_notifications
  add column if not exists lesson_id uuid references public.lessons(id) on delete cascade,
  add column if not exists lesson_comment_id uuid references public.lesson_comments(id) on delete cascade;

-- 2) Amplía el CHECK de type.
alter table public.conversation_notifications drop constraint if exists conversation_notifications_type_check;
alter table public.conversation_notifications
  add constraint conversation_notifications_type_check
  check (type in ('reply','mention','lesson_reply','lesson_comment_new'));

-- 3) Trigger de reply del foro: notifica autor del hilo Y autor del padre (dedupe).
create or replace function public.tg_conversation_reply_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_thread uuid; v_parent uuid; r uuid; recips uuid[] := '{}';
begin
  select author_id into v_thread from public.conversation_threads where id = new.thread_id;
  if new.parent_id is not null then
    select author_id into v_parent from public.conversation_comments where id = new.parent_id;
  end if;
  if v_thread is not null and v_thread <> new.author_id then recips := array_append(recips, v_thread); end if;
  if v_parent is not null and v_parent <> new.author_id and v_parent <> v_thread then
    recips := array_append(recips, v_parent);
  end if;
  foreach r in array recips loop
    insert into public.conversation_notifications (user_id, actor_id, type, thread_id, comment_id)
    values (r, new.author_id, 'reply', new.thread_id, new.id);
  end loop;
  return new;
end; $$;
-- El trigger ya existe (0048); create-or-replace de la función basta.
