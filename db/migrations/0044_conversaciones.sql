-- =============================================================================
-- Capital Academy — Conversaciones (foro de comunidad por programa). ADR-0010.
-- =============================================================================

-- Helpers program-scoped (análogos a has_cohort_access / is_cohort_staff de 0007)
create or replace function public.has_program_access(p_program_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_platform_staff() or exists (
    select 1 from public.enrollments e
    join public.cohorts c on c.id = e.cohort_id
    where c.program_id = p_program_id
      and e.student_id = auth.uid()
      and e.status in ('active','completed')
  );
$$;

create or replace function public.is_program_staff(p_program_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_platform_staff() or exists (
    select 1 from public.cohort_roles cr
    join public.cohorts c on c.id = cr.cohort_id
    where c.program_id = p_program_id
      and cr.user_id = auth.uid()
      and cr.role in ('teacher','assistant')
  );
$$;

-- Threads (conversaciones)
create table public.conversation_threads (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'general',
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  comment_count integer not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversation_threads_program_idx
  on public.conversation_threads(program_id, is_pinned desc, last_activity_at desc);

create trigger trg_conversation_threads_updated_at
  before update on public.conversation_threads
  for each row execute function public.tg_set_updated_at();

-- Comentarios (1 nivel vía parent_id)
create table public.conversation_comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.conversation_threads(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.conversation_comments(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversation_comments_thread_idx on public.conversation_comments(thread_id, created_at);
create index conversation_comments_parent_idx on public.conversation_comments(parent_id) where parent_id is not null;

create trigger trg_conversation_comments_updated_at
  before update on public.conversation_comments
  for each row execute function public.tg_set_updated_at();

-- Reacciones ❤️ (una por usuario por target; target = thread XOR comment)
create table public.conversation_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid references public.conversation_threads(id) on delete cascade,
  comment_id uuid references public.conversation_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversation_reactions_target_chk check (
    (thread_id is not null and comment_id is null) or
    (thread_id is null and comment_id is not null)
  )
);
create unique index conversation_reactions_thread_uniq on public.conversation_reactions(user_id, thread_id) where thread_id is not null;
create unique index conversation_reactions_comment_uniq on public.conversation_reactions(user_id, comment_id) where comment_id is not null;

-- Mantención de comment_count + last_activity_at
create or replace function public.tg_conversation_comment_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    update public.conversation_threads
      set comment_count = comment_count + 1, last_activity_at = now()
      where id = new.thread_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.conversation_threads
      set comment_count = greatest(comment_count - 1, 0)
      where id = old.thread_id;
    return old;
  end if;
  return null;
end;
$$;
create trigger trg_conversation_comment_activity
  after insert or delete on public.conversation_comments
  for each row execute function public.tg_conversation_comment_activity();

-- RLS
alter table public.conversation_threads enable row level security;
alter table public.conversation_comments enable row level security;
alter table public.conversation_reactions enable row level security;

create policy conversation_threads_select on public.conversation_threads
  for select using (public.has_program_access(program_id));
create policy conversation_threads_insert on public.conversation_threads
  for insert with check (auth.uid() = author_id and public.has_program_access(program_id));
create policy conversation_threads_author_update on public.conversation_threads
  for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy conversation_threads_staff_update on public.conversation_threads
  for update using (public.is_program_staff(program_id));
create policy conversation_threads_author_delete on public.conversation_threads
  for delete using (auth.uid() = author_id);
create policy conversation_threads_staff_delete on public.conversation_threads
  for delete using (public.is_program_staff(program_id));

create policy conversation_comments_select on public.conversation_comments
  for select using (exists (
    select 1 from public.conversation_threads t
    where t.id = conversation_comments.thread_id and public.has_program_access(t.program_id)));
create policy conversation_comments_insert on public.conversation_comments
  for insert with check (auth.uid() = author_id and exists (
    select 1 from public.conversation_threads t
    where t.id = conversation_comments.thread_id
      and public.has_program_access(t.program_id) and t.is_locked = false));
create policy conversation_comments_author_update on public.conversation_comments
  for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy conversation_comments_author_delete on public.conversation_comments
  for delete using (auth.uid() = author_id);
create policy conversation_comments_staff_all on public.conversation_comments
  for all using (public.is_platform_staff());

create policy conversation_reactions_select on public.conversation_reactions
  for select using (
    (thread_id is not null and exists (select 1 from public.conversation_threads t where t.id = thread_id and public.has_program_access(t.program_id)))
    or (comment_id is not null and exists (select 1 from public.conversation_comments cc join public.conversation_threads t on t.id = cc.thread_id where cc.id = comment_id and public.has_program_access(t.program_id))));
create policy conversation_reactions_insert on public.conversation_reactions
  for insert with check (auth.uid() = user_id and (
    (thread_id is not null and exists (select 1 from public.conversation_threads t where t.id = thread_id and public.has_program_access(t.program_id)))
    or (comment_id is not null and exists (select 1 from public.conversation_comments cc join public.conversation_threads t on t.id = cc.thread_id where cc.id = comment_id and public.has_program_access(t.program_id)))));
create policy conversation_reactions_delete on public.conversation_reactions
  for delete using (auth.uid() = user_id);
