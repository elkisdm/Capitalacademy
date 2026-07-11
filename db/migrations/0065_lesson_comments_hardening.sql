-- =============================================================================
-- Capital Academy — Endurecimiento de comentarios de lección (0011 → hardening).
-- Acceso docente (cohort_roles), status active/completed, WITH CHECK en update,
-- CHECK de largo, validación de parent, freeze de columnas, soft delete + edited.
-- ADR-0014.
-- =============================================================================

-- 1) Soft delete + marca de edición.
alter table public.lesson_comments
  add column if not exists deleted_at timestamptz,
  add column if not exists edited_at  timestamptz;

-- 2) CHECK de largo (espeja max(2000) de Zod); exime filas borradas (content='').
alter table public.lesson_comments drop constraint if exists lesson_comments_content_len;
alter table public.lesson_comments
  add constraint lesson_comments_content_len
  check (deleted_at is not null or char_length(content) between 1 and 2000);

-- 3) Índice parcial para el listado/conteo excluyendo borrados.
create index if not exists lesson_comments_lesson_active_idx
  on public.lesson_comments(lesson_id, created_at) where deleted_at is null;

-- 4) Helpers scoped a la lección (reusan has_program_access/is_program_staff de 0044/0057).
create or replace function public.has_lesson_access(p_lesson_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.lessons l
    join public.program_modules pm on pm.id = l.module_id
    where l.id = p_lesson_id and public.has_program_access(pm.program_id));
$$;
create or replace function public.is_lesson_staff(p_lesson_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.lessons l
    join public.program_modules pm on pm.id = l.module_id
    where l.id = p_lesson_id and public.is_program_staff(pm.program_id));
$$;

-- 5) Reemplaza las policies de 0011 (que excluían docentes y status='completed').
drop policy if exists lesson_comments_student_select on public.lesson_comments;
drop policy if exists lesson_comments_student_insert on public.lesson_comments;
drop policy if exists lesson_comments_author_update on public.lesson_comments;
drop policy if exists lesson_comments_author_delete on public.lesson_comments;
drop policy if exists lesson_comments_staff_all    on public.lesson_comments;

create policy lesson_comments_select on public.lesson_comments
  for select using (public.has_lesson_access(lesson_id));
create policy lesson_comments_insert on public.lesson_comments
  for insert with check (auth.uid() = author_id and public.has_lesson_access(lesson_id));
create policy lesson_comments_author_update on public.lesson_comments
  for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
create policy lesson_comments_author_delete on public.lesson_comments
  for delete using (auth.uid() = author_id);
create policy lesson_comments_staff_update on public.lesson_comments
  for update using (public.is_lesson_staff(lesson_id)) with check (public.is_lesson_staff(lesson_id));
create policy lesson_comments_staff_delete on public.lesson_comments
  for delete using (public.is_lesson_staff(lesson_id));

-- 6) Validación de parent (mismo lesson, parent raíz, sin profundidad 3+).
create or replace function public.tg_lesson_comment_validate_parent()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.parent_id is not null then
    select lesson_id, parent_id into p from public.lesson_comments where id = new.parent_id;
    if p is null then raise exception 'parent not found' using errcode='foreign_key_violation'; end if;
    if p.lesson_id <> new.lesson_id then raise exception 'parent in another lesson' using errcode='check_violation'; end if;
    if p.parent_id is not null then raise exception 'only one reply level' using errcode='check_violation'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_lesson_comment_validate_parent on public.lesson_comments;
create trigger trg_lesson_comment_validate_parent
  before insert on public.lesson_comments
  for each row execute function public.tg_lesson_comment_validate_parent();

-- 7) Freeze de columnas inmutables en update (autor no puede mover la fila).
create or replace function public.tg_lesson_comment_freeze()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.author_id <> old.author_id or new.lesson_id <> old.lesson_id
     or new.parent_id is distinct from old.parent_id or new.created_at <> old.created_at then
    raise exception 'immutable lesson_comment columns' using errcode='check_violation';
  end if;
  return new;
end; $$;
drop trigger if exists trg_lesson_comment_freeze on public.lesson_comments;
create trigger trg_lesson_comment_freeze
  before update on public.lesson_comments
  for each row execute function public.tg_lesson_comment_freeze();
