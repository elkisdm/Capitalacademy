-- =============================================================================
-- Capital Academy — Endurecimiento de Conversaciones (0044 → hardening). ADR-0014.
-- Cierra el WITH CHECK cross-tenant (author puede cambiar program_id/is_pinned…),
-- agrega policy UPDATE en reactions + índices, staff_all → is_program_staff,
-- valida parent, y añade edited_at/deleted_at + CHECKs.
-- =============================================================================

-- 1) edited_at / deleted_at.
alter table public.conversation_threads  add column if not exists edited_at  timestamptz;
alter table public.conversation_comments add column if not exists edited_at  timestamptz,
                                         add column if not exists deleted_at timestamptz;

-- 2) CHECK de categoría (hoy solo validada en app) y de largo del comentario.
alter table public.conversation_threads drop constraint if exists conversation_threads_category_chk;
alter table public.conversation_threads
  add constraint conversation_threads_category_chk
  check (category in ('general','dudas','recursos','logros','presentaciones'));
alter table public.conversation_comments drop constraint if exists conversation_comments_body_len;
alter table public.conversation_comments
  add constraint conversation_comments_body_len
  check (deleted_at is not null or char_length(body) between 1 and 5000);

-- 3) Índices para la agregación de reacciones por target (.in(thread_id|comment_id)).
create index if not exists conversation_reactions_thread_idx
  on public.conversation_reactions(thread_id) where thread_id is not null;
create index if not exists conversation_reactions_comment_idx
  on public.conversation_reactions(comment_id) where comment_id is not null;

-- 4) Policy UPDATE que faltaba en reactions (cambiar de emoji hacía update→0 filas).
drop policy if exists conversation_reactions_update on public.conversation_reactions;
create policy conversation_reactions_update on public.conversation_reactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5) THREADS: author_update re-valida acceso al programa; freeze de sistema.
drop policy if exists conversation_threads_author_update on public.conversation_threads;
create policy conversation_threads_author_update on public.conversation_threads
  for update using (auth.uid() = author_id)
  with check (auth.uid() = author_id and public.has_program_access(program_id));

-- El contador (tg_conversation_comment_activity) marca un flag txn-local para que
-- el freeze distinga mantención de sistema vs manipulación por REST del usuario.
create or replace function public.tg_conversation_comment_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.thread_counter_maint','1',true);
  if (tg_op='INSERT') then
    update public.conversation_threads
      set comment_count = comment_count + 1, last_activity_at = now() where id = new.thread_id;
    return new;
  elsif (tg_op='DELETE') then
    update public.conversation_threads
      set comment_count = greatest(comment_count - 1, 0) where id = old.thread_id;
    return old;
  end if;
  return null;
end; $$;

create or replace function public.tg_conversation_thread_freeze()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_maint boolean := coalesce(current_setting('app.thread_counter_maint', true),'') = '1';
begin
  if new.program_id <> old.program_id or new.author_id <> old.author_id
     or new.created_at <> old.created_at then
    raise exception 'immutable thread columns' using errcode='check_violation';
  end if;
  if not v_maint then
    if new.comment_count is distinct from old.comment_count
       or new.last_activity_at is distinct from old.last_activity_at then
      raise exception 'comment_count/last_activity_at are system-managed' using errcode='check_violation';
    end if;
    if (new.is_pinned is distinct from old.is_pinned or new.is_locked is distinct from old.is_locked)
       and not public.is_program_staff(new.program_id) then
      raise exception 'only staff can pin/lock' using errcode='insufficient_privilege';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_conversation_thread_freeze on public.conversation_threads;
create trigger trg_conversation_thread_freeze
  before update on public.conversation_threads
  for each row execute function public.tg_conversation_thread_freeze();

-- 6) COMMENTS: staff_all (is_platform_staff) → is_program_staff; freeze; parent.
drop policy if exists conversation_comments_staff_all on public.conversation_comments;
create policy conversation_comments_staff_update on public.conversation_comments
  for update using (exists (select 1 from public.conversation_threads t
      where t.id = conversation_comments.thread_id and public.is_program_staff(t.program_id)))
  with check (exists (select 1 from public.conversation_threads t
      where t.id = conversation_comments.thread_id and public.is_program_staff(t.program_id)));
create policy conversation_comments_staff_delete on public.conversation_comments
  for delete using (exists (select 1 from public.conversation_threads t
      where t.id = conversation_comments.thread_id and public.is_program_staff(t.program_id)));

create or replace function public.tg_conversation_comment_freeze()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.thread_id <> old.thread_id or new.author_id <> old.author_id
     or new.parent_id is distinct from old.parent_id or new.created_at <> old.created_at then
    raise exception 'immutable comment columns' using errcode='check_violation';
  end if;
  return new;
end; $$;
drop trigger if exists trg_conversation_comment_freeze on public.conversation_comments;
create trigger trg_conversation_comment_freeze
  before update on public.conversation_comments
  for each row execute function public.tg_conversation_comment_freeze();

create or replace function public.tg_conversation_comment_validate_parent()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.parent_id is not null then
    select thread_id, parent_id into p from public.conversation_comments where id = new.parent_id;
    if p is null then raise exception 'parent not found' using errcode='foreign_key_violation'; end if;
    if p.thread_id <> new.thread_id then raise exception 'parent in another thread' using errcode='check_violation'; end if;
    if p.parent_id is not null then raise exception 'only one reply level' using errcode='check_violation'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_conversation_comment_validate_parent on public.conversation_comments;
create trigger trg_conversation_comment_validate_parent
  before insert on public.conversation_comments
  for each row execute function public.tg_conversation_comment_validate_parent();
